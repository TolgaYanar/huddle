package tv.wehuddle.app.data.repository

import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import tv.wehuddle.app.data.local.PreferencesManager
import tv.wehuddle.app.data.model.*
import tv.wehuddle.app.data.network.SocketClient
import tv.wehuddle.app.data.network.SocketEvent
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "RoomRepo"

/**
 * Repository for room-related operations
 */
@Singleton
class RoomRepository @Inject constructor(
    private val socketClient: SocketClient,
    private val preferencesManager: PreferencesManager
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    
    // State flows for room data
    private val _roomState = MutableStateFlow(RoomUiState())
    val roomState: StateFlow<RoomUiState> = _roomState.asStateFlow()
    
    private val _participants = MutableStateFlow<List<Participant>>(emptyList())
    val participants: StateFlow<List<Participant>> = _participants.asStateFlow()
    
    private val _chatMessages = MutableStateFlow<List<ChatMessage>>(emptyList())
    val chatMessages: StateFlow<List<ChatMessage>> = _chatMessages.asStateFlow()
    
    private val _activityLog = MutableStateFlow<List<ActivityLogEntry>>(emptyList())
    val activityLog: StateFlow<List<ActivityLogEntry>> = _activityLog.asStateFlow()
    
    private val _wheelState = MutableStateFlow(WheelState("", emptyList(), null))
    val wheelState: StateFlow<WheelState> = _wheelState.asStateFlow()
    
    private val _playlistState = MutableStateFlow(PlaylistStateData("", emptyList(), null, 0))
    val playlistState: StateFlow<PlaylistStateData> = _playlistState.asStateFlow()
    
    // Expose socket connection state and events
    val connectionState: StateFlow<ConnectionState> = socketClient.connectionState
    val socketId: StateFlow<String?> = socketClient.socketId
    val socketEvents: SharedFlow<SocketEvent> = socketClient.events
    
    // Guard against new joiners broadcasting play/pause before receiving initial room state
    // This prevents new users from resetting the room position for everyone
    @Volatile
    private var hasReceivedInitialSync = false
    private var joinTimeMillis: Long = 0L

    // Clock offset between server and device (serverTime - deviceTime)
    // Positive means device is behind server, negative means device is ahead
    @Volatile
    private var clockOffsetMs: Long = 0L

    // User-intent windows. When the local user *just* pressed pause / seeked,
    // a stale remote `play` / `seek` arriving immediately after must not undo
    // their gesture. Web has the same guard via `lastUserPauseAtRef` /
    // `lastManualSeekRef`. 5 s matches the web USER_PAUSE_INTENT_WINDOW_MS.
    @Volatile
    private var lastUserPauseAtMs: Long = 0L
    @Volatile
    private var lastUserSeekAtMs: Long = 0L
    private val userIntentWindowMs: Long = 5000L

    // Room anchor used by the periodic drift-correction loop (#5). The
    // anchor is the *authoritative* server-known position at a known wall-
    // clock instant. We extrapolate forward from it to compute where the
    // player *should* be, and re-seek when the player has drifted too far.
    // Distinct from videoState.currentTime, which gets refreshed every 500 ms
    // by ExoPlayer's progress callback after the cooldown.
    private data class RoomAnchor(
        val time: Double,
        val atMs: Long,
        val isPlaying: Boolean,
        val speed: Float,
        val url: String,
    )
    @Volatile
    private var roomAnchor: RoomAnchor? = null
    private val driftCheckIntervalMs: Long = 2500L
    private val driftCorrectionThresholdSec: Double = 3.0
    
    // Start event collection eagerly to avoid missing initial events
    private val eventCollectorJob = scope.launch {
        socketClient.events.collect { event ->
            handleSocketEvent(event)
        }
    }

    // Periodic drift-correction loop (#5). Web has the equivalent in
    // useRoomCatchup.syncToRoomTimeIfNeeded; without it, an Android client
    // that buffers/falls behind has no positive code path that pulls them
    // back in line — the existing 1500ms cooldown only blocks progress
    // updates from overwriting sync; it never adds drift correction itself.
    private val driftCorrectionJob = scope.launch {
        while (true) {
            kotlinx.coroutines.delay(driftCheckIntervalMs)
            try {
                checkAndCorrectDrift()
            } catch (t: Throwable) {
                Log.w(TAG, "Drift correction loop failed: ${t.message}")
            }
        }
    }

    init {
        // Keep socket auth in sync with login/logout.
        scope.launch {
            preferencesManager.authToken.collectLatest { token ->
                socketClient.setAuthToken(token)
            }
        }
    }

    private fun applyAudioSyncEnabled(current: RoomUiState, enabled: Boolean): RoomUiState {
        return if (enabled) {
            current.copy(
                audioSyncEnabled = true,
                videoState = current.videoState.copy(
                    localVolumeOverride = null,
                    localMutedOverride = null
                )
            )
        } else {
            current.copy(
                audioSyncEnabled = false,
                videoState = current.videoState.copy(
                    localVolumeOverride = current.videoState.localVolumeOverride ?: current.videoState.volume,
                    localMutedOverride = current.videoState.localMutedOverride ?: current.videoState.isMuted
                )
            )
        }
    }
    
    private fun handleSocketEvent(event: SocketEvent) {
        when (event) {
            is SocketEvent.Connected -> {
                _roomState.update { it.copy(connectionState = ConnectionState.CONNECTED) }
            }
            
            is SocketEvent.Disconnected -> {
                _roomState.update { it.copy(connectionState = ConnectionState.DISCONNECTED) }
            }
            
            is SocketEvent.Error -> {
                _roomState.update { it.copy(error = event.message) }
            }
            
            is SocketEvent.RoomUsers -> {
                val currentUserId = socketClient.socketId.value ?: ""
                val usernamesById = event.data.usernames ?: emptyMap()
                val participantsList = event.data.users.map { id ->
                    Participant(
                        id = id,
                        username = usernamesById[id],
                        isLocal = id == currentUserId,
                        isHost = id == event.data.hostId,
                        mediaState = event.data.mediaStates?.get(id) ?: WebRTCMediaState()
                    )
                }
                _participants.value = participantsList
                _roomState.update { 
                    it.copy(
                        hostId = event.data.hostId,
                        participants = participantsList,
                        userId = currentUserId,
                        passwordRequired = false,
                        passwordError = null
                    )
                }
            }
            
            is SocketEvent.UserJoined -> {
                val newParticipant = Participant(
                    id = event.data.socketId,
                    username = event.data.username
                )
                _participants.update { current ->
                    if (current.none { it.id == event.data.socketId }) {
                        current + newParticipant
                    } else current
                }
                addActivityLogEntry(
                    kind = ActivityLogKind.JOIN,
                    message = (event.data.username?.takeIf { it.isNotBlank() } ?: "User") + " joined",
                    senderId = event.data.socketId,
                    senderName = event.data.username
                )
            }
            
            is SocketEvent.UserLeft -> {
                _participants.update { current ->
                    current.filter { it.id != event.data.socketId }
                }
                addActivityLogEntry(
                    kind = ActivityLogKind.LEAVE,
                    message = (event.data.username?.takeIf { it.isNotBlank() } ?: "User") + " left",
                    senderId = event.data.socketId,
                    senderName = event.data.username
                )
            }
            
            is SocketEvent.SyncEvent -> {
                // Update clock offset if server sent its current time
                event.data.serverNow?.let { serverNow ->
                    val deviceNow = System.currentTimeMillis()
                    clockOffsetMs = serverNow - deviceNow
                    Log.d(TAG, "Clock sync (SyncEvent): offset=${clockOffsetMs}ms (${clockOffsetMs/1000.0}s)")
                }
                
                // Skip events that we sent ourselves (we already updated state locally)
                val mySocketId = socketClient.socketId.value
                val isFromSelf = event.data.senderId != null && event.data.senderId == mySocketId
                
                android.util.Log.d("RoomRepo", "SyncEvent received: action=${event.data.action}, from=${event.data.senderId}, myId=$mySocketId, isFromSelf=$isFromSelf")
                
                // Always log activity, but only update state if from someone else
                val logKind = when (event.data.action) {
                    SyncAction.play -> ActivityLogKind.PLAY
                    SyncAction.pause -> ActivityLogKind.PAUSE
                    SyncAction.seek -> ActivityLogKind.SEEK
                    SyncAction.change_url -> ActivityLogKind.URL_CHANGE
                    SyncAction.set_mute, SyncAction.set_speed, SyncAction.set_volume, SyncAction.set_audio_sync -> ActivityLogKind.SYSTEM
                }
                
                // Only apply state changes from other users (we already applied our own)
                if (!isFromSelf) {
                    val nowMs = System.currentTimeMillis()
                    // Respect the local user's recent intent: an inbound `play`
                    // arriving right after they paused, or an inbound `seek`
                    // arriving right after they manually seeked, must not undo
                    // the gesture. We still log + advance non-conflicting bits.
                    val userPausedRecently =
                        nowMs - lastUserPauseAtMs < userIntentWindowMs
                    val userSeekedRecently =
                        nowMs - lastUserSeekAtMs < userIntentWindowMs
                    val ignorePlayResume =
                        event.data.action == SyncAction.play && userPausedRecently
                    val ignoreSeekTime =
                        event.data.action == SyncAction.seek && userSeekedRecently

                    if (ignorePlayResume) {
                        android.util.Log.d(
                            "RoomRepo",
                            "Suppressing remote play: user paused ${nowMs - lastUserPauseAtMs}ms ago"
                        )
                    }
                    if (ignoreSeekTime) {
                        android.util.Log.d(
                            "RoomRepo",
                            "Suppressing remote seek time: user seeked ${nowMs - lastUserSeekAtMs}ms ago"
                        )
                    }

                    // Hoisted out of the _roomState.update lambda so the
                    // post-update anchor refresh below can read it.
                    val shouldUpdateSyncTime = when (event.data.action) {
                        SyncAction.play,
                        SyncAction.pause,
                        SyncAction.change_url -> true
                        SyncAction.seek -> !ignoreSeekTime
                        else -> false
                    }

                    _roomState.update { current ->
                        val nextWithAudioSync = event.data.audioSyncEnabled?.let { enabled ->
                            applyAudioSyncEnabled(current, enabled)
                        } ?: current

                        val nextUrl = event.data.videoUrl ?: current.videoState.url
                        val nextCurrentTime = when (event.data.action) {
                            SyncAction.play,
                            SyncAction.pause,
                            SyncAction.change_url -> event.data.timestamp
                            SyncAction.seek -> if (ignoreSeekTime) current.videoState.currentTime else event.data.timestamp
                            SyncAction.set_mute,
                            SyncAction.set_speed,
                            SyncAction.set_volume,
                            SyncAction.set_audio_sync -> current.videoState.currentTime
                        }

                        nextWithAudioSync.copy(
                            videoState = nextWithAudioSync.videoState.copy(
                                url = nextUrl,
                                currentTime = nextCurrentTime,
                                // Preserve playing state on seek, change it only on play/pause.
                                // If the user just paused, an inbound `play` is suppressed.
                                isPlaying = when (event.data.action) {
                                    SyncAction.play -> if (ignorePlayResume) current.videoState.isPlaying else true
                                    SyncAction.pause -> false
                                    SyncAction.seek -> current.videoState.isPlaying
                                    SyncAction.change_url -> false
                                    SyncAction.set_mute,
                                    SyncAction.set_speed,
                                    SyncAction.set_volume,
                                    SyncAction.set_audio_sync -> current.videoState.isPlaying
                                },
                                volume = event.data.volume ?: current.videoState.volume,
                                isMuted = event.data.isMuted ?: current.videoState.isMuted,
                                playbackSpeed = event.data.playbackSpeed ?: current.videoState.playbackSpeed,
                                // Set lastRemoteSyncAt to prevent progress callback from overwriting
                                lastRemoteSyncAt = if (shouldUpdateSyncTime) nowMs else current.videoState.lastRemoteSyncAt
                            )
                        )
                    }

                    // Refresh the drift-correction anchor whenever a position-
                    // changing event arrives. We use the *post-update* state so
                    // the suppression flags above (ignoreSeekTime / ignorePlay-
                    // Resume) are reflected.
                    if (shouldUpdateSyncTime) {
                        val st = _roomState.value
                        roomAnchor = RoomAnchor(
                            time = st.videoState.currentTime,
                            atMs = nowMs,
                            isPlaying = st.videoState.isPlaying,
                            speed = st.videoState.playbackSpeed,
                            url = st.videoState.url,
                        )
                    }
                }
                
                addActivityLogEntry(
                    kind = logKind,
                    message = when (event.data.action) {
                        SyncAction.play -> "Played video"
                        SyncAction.pause -> "Paused video"
                        SyncAction.seek -> "Seeked to ${formatTime(event.data.timestamp)}"
                        SyncAction.change_url -> "Changed video"
                        SyncAction.set_mute -> {
                            val muted = event.data.isMuted
                            if (muted == true) "Muted" else "Unmuted"
                        }
                        SyncAction.set_speed -> {
                            val speed = event.data.playbackSpeed
                            if (speed != null) "Speed set to ${speed}x" else "Changed speed"
                        }
                        SyncAction.set_volume -> "Changed volume"
                        SyncAction.set_audio_sync -> {
                            val enabled = event.data.audioSyncEnabled
                            if (enabled == false) "Audio sync disabled" else "Audio sync enabled"
                        }
                    },
                    senderId = event.data.senderId,
                    senderName = event.data.senderUsername
                )
            }
            
            is SocketEvent.RoomState -> {
                Log.d(TAG, "RoomState received - url: ${event.data.videoUrl}, time: ${event.data.timestamp}, isPlaying: ${event.data.isPlaying}, updatedAt: ${event.data.updatedAt}")
                
                // Update clock offset if server sent its current time
                // This compensates for device clocks that are behind or ahead of the server
                event.data.serverNow?.let { serverNow ->
                    val deviceNow = System.currentTimeMillis()
                    clockOffsetMs = serverNow - deviceNow
                    Log.d(TAG, "Clock sync: serverNow=$serverNow, deviceNow=$deviceNow, offset=${clockOffsetMs}ms (${clockOffsetMs/1000.0}s)")
                }
                
                // Mark initial sync complete after receiving room state.
                // Originally 600 ms, but combined with the 1000 ms timeSinceJoin
                // floor below it gave a ~1.6 s window where a user's first
                // play/pause silently dropped. 200 ms is enough to let the
                // applied seek/play settle without making early input feel dead.
                scope.launch {
                    kotlinx.coroutines.delay(200)
                    hasReceivedInitialSync = true
                    Log.d(TAG, "Initial sync complete - playback events now allowed")
                }
                
                _roomState.update { current ->
                    // The server already calculates the estimated timestamp for room_state events
                    // (request_room_state handler extrapolates based on elapsed time)
                    // So we should NOT extrapolate again - just use the timestamp directly
                    // The presence of serverNow indicates this is from request_room_state
                    val serverTimestamp = event.data.timestamp ?: 0.0
                    val serverIsPlaying = event.data.isPlaying ?: false
                    val isFromResync = event.data.serverNow != null
                    
                    // Only extrapolate for sync_video events (no serverNow), not room_state
                    val finalTime = if (!isFromResync && serverIsPlaying && event.data.updatedAt != null && event.data.updatedAt > 0) {
                        val serverUpdatedAt = event.data.updatedAt
                        val serverSpeed = event.data.playbackSpeed ?: current.videoState.playbackSpeed
                        val deviceNow = System.currentTimeMillis()
                        val adjustedNow = deviceNow + clockOffsetMs
                        val elapsedMs = adjustedNow - serverUpdatedAt
                        val clampedElapsedMs = elapsedMs.coerceIn(0L, 300_000L)
                        val elapsedSeconds = clampedElapsedMs / 1000.0
                        Log.d(TAG, "Extrapolation: deviceNow=$deviceNow, adjustedNow=$adjustedNow, serverUpdatedAt=$serverUpdatedAt, elapsedMs=$elapsedMs, clampedMs=$clampedElapsedMs, offset=${clockOffsetMs}ms")
                        serverTimestamp + (elapsedSeconds * serverSpeed)
                    } else {
                        // Server already extrapolated (room_state) or video is paused - use as-is
                        Log.d(TAG, "Using server timestamp directly (isFromResync=$isFromResync, isPlaying=$serverIsPlaying): $serverTimestamp")
                        serverTimestamp
                    }
                    
                    Log.d(TAG, "RoomState: serverTime=$serverTimestamp, finalTime=$finalTime, isPlaying=$serverIsPlaying, isFromResync=$isFromResync")
                    
                    val newSyncTime = System.currentTimeMillis()
                    Log.d(TAG, "RoomState: Setting lastRemoteSyncAt=$newSyncTime for URL: ${event.data.videoUrl ?: "none"}")
                    
                    val base = current.copy(
                        videoState = current.videoState.copy(
                            url = event.data.videoUrl ?: "",
                            currentTime = finalTime,
                            isPlaying = event.data.isPlaying
                                ?: when (event.data.action) {
                                    SyncAction.play -> true
                                    SyncAction.pause -> false
                                    else -> current.videoState.isPlaying
                                },
                            volume = event.data.volume ?: current.videoState.volume,
                            isMuted = event.data.isMuted ?: current.videoState.isMuted,
                            playbackSpeed = event.data.playbackSpeed ?: current.videoState.playbackSpeed,
                            platform = detectPlatform(event.data.videoUrl ?: ""),
                            lastRemoteSyncAt = newSyncTime
                        )
                    )

                    // Establish / refresh the drift-correction anchor (#5)
                    // from this snapshot.
                    roomAnchor = RoomAnchor(
                        time = finalTime,
                        atMs = newSyncTime,
                        isPlaying = base.videoState.isPlaying,
                        speed = base.videoState.playbackSpeed,
                        url = base.videoState.url,
                    )

                    if (event.data.audioSyncEnabled != null) {
                        applyAudioSyncEnabled(base, event.data.audioSyncEnabled)
                    } else {
                        base
                    }
                }
            }
            
            is SocketEvent.ChatMessageReceived -> {
                _chatMessages.update { current ->
                    current + event.data
                }
                addActivityLogEntry(
                    kind = ActivityLogKind.CHAT,
                    message = event.data.text,
                    senderId = event.data.senderId,
                    senderName = event.data.senderUsername
                )
            }
            
            is SocketEvent.ChatHistoryReceived -> {
                _chatMessages.value = event.data.messages
            }
            
            is SocketEvent.ActivityEventReceived -> {
                val kind = when (event.data.kind) {
                    "join" -> ActivityLogKind.JOIN
                    "leave" -> ActivityLogKind.LEAVE
                    "sync" -> when (event.data.action) {
                        "play" -> ActivityLogKind.PLAY
                        "pause" -> ActivityLogKind.PAUSE
                        "seek" -> ActivityLogKind.SEEK
                        "change_url" -> ActivityLogKind.URL_CHANGE
                        else -> ActivityLogKind.SYSTEM
                    }
                    else -> ActivityLogKind.SYSTEM
                }
                
                val entry = ActivityLogEntry(
                    id = event.data.id,
                    kind = kind,
                    message = buildActivityMessage(event.data),
                    timestamp = parseTimestamp(event.data.createdAt),
                    senderId = event.data.senderId,
                    senderName = event.data.senderUsername
                )
                
                _activityLog.update { current ->
                    if (current.none { it.id == entry.id }) {
                        (current + entry).takeLast(100)
                    } else current
                }
            }
            
            is SocketEvent.ActivityHistoryReceived -> {
                val entries = event.data.events.map { activityEvent ->
                    val kind = when (activityEvent.kind) {
                        "join" -> ActivityLogKind.JOIN
                        "leave" -> ActivityLogKind.LEAVE
                        "sync" -> when (activityEvent.action) {
                            "play" -> ActivityLogKind.PLAY
                            "pause" -> ActivityLogKind.PAUSE
                            "seek" -> ActivityLogKind.SEEK
                            "change_url" -> ActivityLogKind.URL_CHANGE
                            else -> ActivityLogKind.SYSTEM
                        }
                        else -> ActivityLogKind.SYSTEM
                    }
                    
                    ActivityLogEntry(
                        id = activityEvent.id,
                        kind = kind,
                        message = buildActivityMessage(activityEvent),
                        timestamp = parseTimestamp(activityEvent.createdAt),
                        senderId = activityEvent.senderId,
                        senderName = activityEvent.senderUsername
                    )
                }
                _activityLog.value = entries
            }
            
            is SocketEvent.PasswordStatus -> {
                _roomState.update { 
                    it.copy(
                        hasRoomPassword = event.data.hasPassword,
                        passwordRequired = false,
                        passwordError = null
                    ) 
                }
            }
            
            is SocketEvent.PasswordRequired -> {
                _roomState.update { 
                    it.copy(
                        passwordRequired = true,
                        passwordError = if (event.data.reason == "invalid") "Incorrect password" else null
                    )
                }
            }
            
            is SocketEvent.WheelStateReceived -> {
                _wheelState.value = event.data
            }
            
            is SocketEvent.WheelSpun -> {
                _wheelState.update { current ->
                    current.copy(
                        entries = event.data.entries ?: current.entries,
                        lastSpin = WheelSpinData(
                            index = event.data.index,
                            result = event.data.result,
                            entryCount = event.data.entryCount,
                            spunAt = event.data.spunAt,
                            senderId = event.data.senderId
                        )
                    )
                }
            }
            
            is SocketEvent.MediaStateReceived -> {
                _participants.update { current ->
                    current.map { participant ->
                        if (participant.id == event.userId) {
                            participant.copy(mediaState = event.state)
                        } else participant
                    }
                }
            }
            
            is SocketEvent.SpeakingStateReceived -> {
                _participants.update { current ->
                    current.map { participant ->
                        if (participant.id == event.userId) {
                            participant.copy(isSpeaking = event.speaking)
                        } else participant
                    }
                }
            }
            
            // WebRTC events are handled by WebRTC manager
            is SocketEvent.WebRTCOfferReceived,
            is SocketEvent.WebRTCAnswerReceived,
            is SocketEvent.WebRTCIceReceived -> {
                // These are handled by WebRTC manager observing the same events
            }
            
            is SocketEvent.PlaylistStateReceived -> {
                _playlistState.value = event.data
            }
            
            is SocketEvent.PlaylistItemPlayed -> {
                // Update the video URL when a playlist item is played
                _roomState.update { it.copy(
                    videoState = it.videoState.copy(url = event.data.videoUrl)
                )}
            }
        }
    }
    
    // Room operations
    fun connect() {
        socketClient.connect()
    }
    
    fun disconnect() {
        socketClient.disconnect()
        resetState()
    }
    
    fun joinRoom(roomId: String, password: String? = null) {
        _roomState.update { it.copy(roomId = roomId, passwordRequired = false, passwordError = null) }
        socketClient.joinRoom(roomId, password)
        
        // Record join time for sync guards
        joinTimeMillis = System.currentTimeMillis()
        
        scope.launch {
            preferencesManager.saveLastRoomId(roomId)
        }
    }
    
    fun leaveRoom() {
        socketClient.leaveRoom()
        // Reset sync guard state when leaving
        hasReceivedInitialSync = false
        joinTimeMillis = 0L
        // Reset clock offset so new room gets fresh sync
        clockOffsetMs = 0L
        // Drop the drift anchor and user-intent timestamps too — otherwise
        // joining a different room would inherit stale guards.
        roomAnchor = null
        lastUserPauseAtMs = 0L
        lastUserSeekAtMs = 0L
        resetState()
    }
    
    fun setRoomPassword(password: String) {
        val roomId = _roomState.value.roomId
        if (roomId.isNotEmpty()) {
            socketClient.setRoomPassword(roomId, password)
        }
    }
    
    fun submitPassword(password: String) {
        val roomId = _roomState.value.roomId
        if (roomId.isNotEmpty()) {
            socketClient.joinRoom(roomId, password)
        }
    }
    
    // Video sync operations
    fun sendPlayEvent(timestamp: Double) {
        val roomId = _roomState.value.roomId
        if (roomId.isEmpty()) {
            android.util.Log.w("RoomRepo", "sendPlayEvent: roomId is empty, not sending")
            return
        }
        
        // Guard: Don't broadcast play events until initial sync is complete
        // This prevents new joiners from resetting room position.
        if (!hasReceivedInitialSync) {
            android.util.Log.w("RoomRepo", "sendPlayEvent: Blocked - waiting for initial sync")
            // Still update local state so player responds
            _roomState.update { current ->
                current.copy(videoState = current.videoState.copy(isPlaying = true))
            }
            return
        }

        android.util.Log.d("RoomRepo", "sendPlayEvent: roomId=$roomId, timestamp=$timestamp")
        socketClient.sendSyncEvent(
            SyncData(
                roomId = roomId,
                action = SyncAction.play,
                timestamp = timestamp,
                senderId = socketClient.socketId.value
            )
        )
        // Update local state immediately so the sender plays too
        _roomState.update { current ->
            android.util.Log.d("RoomRepo", "sendPlayEvent: updating local state to isPlaying=true")
            current.copy(
                videoState = current.videoState.copy(
                    isPlaying = true,
                    currentTime = timestamp
                )
            )
        }
    }
    
    fun sendPauseEvent(timestamp: Double) {
        val roomId = _roomState.value.roomId
        if (roomId.isEmpty()) {
            android.util.Log.w("RoomRepo", "sendPauseEvent: roomId is empty, not sending")
            return
        }
        
        // Guard: Don't broadcast pause events until initial sync is complete
        if (!hasReceivedInitialSync) {
            android.util.Log.w("RoomRepo", "sendPauseEvent: Blocked - waiting for initial sync")
            _roomState.update { current ->
                current.copy(videoState = current.videoState.copy(isPlaying = false))
            }
            return
        }

        android.util.Log.d("RoomRepo", "sendPauseEvent: roomId=$roomId, timestamp=$timestamp")
        // Mark user pause-intent so we don't get auto-resumed by a stale
        // remote `play` event racing this gesture.
        lastUserPauseAtMs = System.currentTimeMillis()
        socketClient.sendSyncEvent(
            SyncData(
                roomId = roomId,
                action = SyncAction.pause,
                timestamp = timestamp,
                senderId = socketClient.socketId.value
            )
        )
        // Reflect pause locally for the sender
        _roomState.update { current ->
            android.util.Log.d("RoomRepo", "sendPauseEvent: updating local state to isPlaying=false")
            current.copy(
                videoState = current.videoState.copy(
                    isPlaying = false,
                    currentTime = timestamp
                )
            )
        }
    }
    
    fun sendSeekEvent(timestamp: Double) {
        val roomId = _roomState.value.roomId
        if (roomId.isEmpty()) {
            return
        }
        
        // Guard: Don't broadcast seek events until initial sync is complete
        if (!hasReceivedInitialSync) {
            android.util.Log.w("RoomRepo", "sendSeekEvent: Blocked - waiting for initial sync")
            return
        }

        // Mark user seek-intent so a periodic drift correction or remote echo
        // doesn't pull us back off the manually-chosen position immediately.
        lastUserSeekAtMs = System.currentTimeMillis()
        socketClient.sendSyncEvent(
            SyncData(
                roomId = roomId,
                action = SyncAction.seek,
                timestamp = timestamp,
                senderId = socketClient.socketId.value
            )
        )
        // Apply seek locally so UI updates instantly
        _roomState.update { current ->
            current.copy(
                videoState = current.videoState.copy(
                    currentTime = timestamp
                )
            )
        }
    }
    
    /**
     * Request the current room state for sync - useful for TV when playback drifts
     * This emits a sync event asking for current state
     */
    fun requestSync() {
        val roomId = _roomState.value.roomId
        if (roomId.isNotEmpty()) {
            Log.d(TAG, "Requesting sync for room: $roomId")
            // Request current state by emitting a "request_sync" event
            socketClient.requestRoomSync(roomId)
        } else {
            Log.w(TAG, "requestSync called but roomId is empty")
        }
    }
    
    fun sendUrlChangeEvent(url: String) {
        val roomId = _roomState.value.roomId
        if (roomId.isNotEmpty()) {
            socketClient.sendSyncEvent(
                SyncData(
                    roomId = roomId,
                    action = SyncAction.change_url,
                    timestamp = 0.0,
                    videoUrl = url,
                    senderId = socketClient.socketId.value
                )
            )
            _roomState.update {
                it.copy(
                    videoState = it.videoState.copy(
                        url = url,
                        platform = detectPlatform(url),
                        // Reset playback state on URL change
                        currentTime = 0.0,
                        isPlaying = false
                    )
                )
            }
            // Drop the anchor for the previous URL so the drift loop doesn't
            // try to seek the new video to the old position.
            roomAnchor = RoomAnchor(
                time = 0.0,
                atMs = System.currentTimeMillis(),
                isPlaying = false,
                speed = _roomState.value.videoState.playbackSpeed,
                url = url,
            )
        }
    }

    fun sendMuteEvent(isMuted: Boolean) {
        val roomId = _roomState.value.roomId
        if (roomId.isNotEmpty()) {
            val current = _roomState.value
            if (current.audioSyncEnabled) {
                val timestamp = current.videoState.currentTime
                socketClient.sendSyncEvent(
                    SyncData(
                        roomId = roomId,
                        action = SyncAction.set_mute,
                        timestamp = timestamp,
                        isMuted = isMuted,
                        senderId = socketClient.socketId.value
                    )
                )
                _roomState.update { st ->
                    st.copy(videoState = st.videoState.copy(isMuted = isMuted))
                }
            } else {
                // Local-only mute while audio sync is disabled.
                _roomState.update { st ->
                    st.copy(videoState = st.videoState.copy(localMutedOverride = isMuted))
                }
            }
        }
    }

    fun sendPlaybackSpeedEvent(playbackSpeed: Float) {
        val roomId = _roomState.value.roomId
        if (roomId.isNotEmpty()) {
            val timestamp = _roomState.value.videoState.currentTime
            socketClient.sendSyncEvent(
                SyncData(
                    roomId = roomId,
                    action = SyncAction.set_speed,
                    timestamp = timestamp,
                    playbackSpeed = playbackSpeed,
                    senderId = socketClient.socketId.value
                )
            )
            _roomState.update { current ->
                current.copy(videoState = current.videoState.copy(playbackSpeed = playbackSpeed))
            }
        }
    }

    fun sendVolumeEvent(volume: Float) {
        val roomId = _roomState.value.roomId
        if (roomId.isNotEmpty()) {
            val current = _roomState.value
            if (current.audioSyncEnabled) {
                val timestamp = current.videoState.currentTime
                socketClient.sendSyncEvent(
                    SyncData(
                        roomId = roomId,
                        action = SyncAction.set_volume,
                        timestamp = timestamp,
                        volume = volume,
                        senderId = socketClient.socketId.value
                    )
                )
                _roomState.update { st ->
                    st.copy(videoState = st.videoState.copy(volume = volume))
                }
            } else {
                // Local-only volume while audio sync is disabled.
                _roomState.update { st ->
                    st.copy(videoState = st.videoState.copy(localVolumeOverride = volume))
                }
            }
        }
    }

    fun setAudioSyncEnabled(enabled: Boolean) {
        val roomId = _roomState.value.roomId
        if (roomId.isNotEmpty()) {
            val timestamp = _roomState.value.videoState.currentTime
            socketClient.sendSyncEvent(
                SyncData(
                    roomId = roomId,
                    action = SyncAction.set_audio_sync,
                    timestamp = timestamp,
                    audioSyncEnabled = enabled,
                    senderId = socketClient.socketId.value
                )
            )
            _roomState.update { st -> applyAudioSyncEnabled(st, enabled) }
        }
    }
    
    fun requestRoomState() {
        val roomId = _roomState.value.roomId
        if (roomId.isNotEmpty()) {
            socketClient.requestRoomState(roomId)
        }
    }

    /**
     * Periodic drift-correction (#5).
     *
     * Compares the player's reported position against the extrapolated
     * room-anchor position. When the player has fallen too far behind /
     * advanced too far ahead, write the expected position back and bump
     * lastRemoteSyncAt — the Compose-side LaunchedEffect in VideoPlayer
     * recognises this as a remote sync and re-seeks the underlying player.
     */
    private fun checkAndCorrectDrift() {
        val anchor = roomAnchor ?: return
        val state = _roomState.value
        if (state.roomId.isEmpty()) return
        if (state.videoState.url != anchor.url) return
        if (!anchor.isPlaying || !state.videoState.isPlaying) return

        val now = System.currentTimeMillis()

        // Respect user intent — they just paused or seeked, don't fight them.
        if (now - lastUserPauseAtMs < userIntentWindowMs) return
        if (now - lastUserSeekAtMs < userIntentWindowMs) return

        // Don't correct while the room is still settling immediately after a
        // remote sync arrived — the player will already be repositioning.
        val timeSinceSync = now - state.videoState.lastRemoteSyncAt
        if (timeSinceSync < 1500L) return

        val elapsedSec = (now - anchor.atMs) / 1000.0
        if (elapsedSec < 0) return
        val expected = anchor.time + elapsedSec * anchor.speed
        val drift = kotlin.math.abs(state.videoState.currentTime - expected)
        if (drift <= driftCorrectionThresholdSec) return

        Log.d(
            TAG,
            "Drift correction: player=${state.videoState.currentTime}s, expected=${expected}s, drift=${drift}s"
        )
        _roomState.update { current ->
            current.copy(
                videoState = current.videoState.copy(
                    currentTime = expected,
                    lastRemoteSyncAt = now,
                )
            )
        }
    }

    // Chat operations
    fun sendChatMessage(text: String) {
        val roomId = _roomState.value.roomId
        if (roomId.isNotEmpty() && text.isNotBlank()) {
            socketClient.sendChatMessage(roomId, text)
        }
    }
    
    fun requestChatHistory() {
        val roomId = _roomState.value.roomId
        if (roomId.isNotEmpty()) {
            socketClient.requestChatHistory(roomId)
        }
    }
    
    fun requestActivityHistory() {
        val roomId = _roomState.value.roomId
        if (roomId.isNotEmpty()) {
            socketClient.requestActivityHistory(roomId)
        }
    }
    
    // Wheel operations
    fun requestWheelState() {
        val roomId = _roomState.value.roomId
        if (roomId.isNotEmpty()) {
            socketClient.requestWheelState(roomId)
        }
    }
    
    fun addWheelEntry(entry: String) {
        val roomId = _roomState.value.roomId
        if (roomId.isNotEmpty()) {
            socketClient.addWheelEntry(roomId, entry)
        }
    }
    
    fun removeWheelEntry(index: Int) {
        val roomId = _roomState.value.roomId
        if (roomId.isNotEmpty()) {
            socketClient.removeWheelEntry(roomId, index)
        }
    }
    
    fun clearWheelEntries() {
        val roomId = _roomState.value.roomId
        if (roomId.isNotEmpty()) {
            socketClient.clearWheelEntries(roomId)
        }
    }
    
    fun spinWheel() {
        val roomId = _roomState.value.roomId
        val entries = _wheelState.value.entries
        android.util.Log.d("WheelPicker", "spinWheel in repo: roomId=$roomId, entries count=${entries.size}")
        if (roomId.isNotEmpty()) {
            socketClient.spinWheel(roomId)
        }
    }
    
    // Playlist methods
    fun requestPlaylistState() {
        val roomId = _roomState.value.roomId
        if (roomId.isNotEmpty()) {
            socketClient.requestPlaylistState(roomId)
        }
    }
    
    fun createPlaylist(name: String, description: String? = null, settings: PlaylistSettings? = null) {
        val roomId = _roomState.value.roomId
        if (roomId.isNotEmpty()) {
            socketClient.createPlaylist(roomId, name, description, settings)
        }
    }
    
    fun updatePlaylist(playlistId: String, name: String? = null, description: String? = null, settings: PlaylistSettings? = null) {
        val roomId = _roomState.value.roomId
        if (roomId.isNotEmpty()) {
            socketClient.updatePlaylist(roomId, playlistId, name, description, settings)
        }
    }
    
    fun deletePlaylist(playlistId: String) {
        val roomId = _roomState.value.roomId
        if (roomId.isNotEmpty()) {
            socketClient.deletePlaylist(roomId, playlistId)
        }
    }
    
    fun addPlaylistItem(playlistId: String, videoUrl: String, title: String? = null, duration: Double? = null, thumbnail: String? = null) {
        val roomId = _roomState.value.roomId
        if (roomId.isNotEmpty()) {
            socketClient.addPlaylistItem(roomId, playlistId, videoUrl, title, duration, thumbnail)
        }
    }
    
    fun removePlaylistItem(playlistId: String, itemId: String) {
        val roomId = _roomState.value.roomId
        if (roomId.isNotEmpty()) {
            socketClient.removePlaylistItem(roomId, playlistId, itemId)
        }
    }
    
    fun reorderPlaylistItems(playlistId: String, itemIds: List<String>) {
        val roomId = _roomState.value.roomId
        if (roomId.isNotEmpty()) {
            socketClient.reorderPlaylistItems(roomId, playlistId, itemIds)
        }
    }
    
    fun setActivePlaylist(playlistId: String?) {
        val roomId = _roomState.value.roomId
        if (roomId.isNotEmpty()) {
            socketClient.setActivePlaylist(roomId, playlistId)
        }
    }
    
    fun playPlaylistItem(playlistId: String, itemId: String) {
        val roomId = _roomState.value.roomId
        if (roomId.isNotEmpty()) {
            socketClient.playPlaylistItem(roomId, playlistId, itemId)
        }
    }
    
    fun playNextInPlaylist() {
        val roomId = _roomState.value.roomId
        if (roomId.isNotEmpty()) {
            socketClient.playNextInPlaylist(roomId)
        }
    }
    
    fun playPreviousInPlaylist() {
        val roomId = _roomState.value.roomId
        if (roomId.isNotEmpty()) {
            socketClient.playPreviousInPlaylist(roomId)
        }
    }
    
    // Media state
    fun sendMediaState(state: WebRTCMediaState) {
        val roomId = _roomState.value.roomId
        if (roomId.isNotEmpty()) {
            socketClient.sendMediaState(roomId, state)
            _roomState.update { it.copy(localMediaState = state) }
        }
    }
    
    fun sendSpeakingState(speaking: Boolean) {
        val roomId = _roomState.value.roomId
        if (roomId.isNotEmpty()) {
            socketClient.sendSpeakingState(roomId, speaking)
            _roomState.update { it.copy(isSpeaking = speaking) }
        }
    }
    
    // WebRTC signaling
    fun sendWebRTCOffer(toId: String, sdp: String) {
        val roomId = _roomState.value.roomId
        if (roomId.isNotEmpty()) {
            socketClient.sendWebRTCOffer(roomId, toId, sdp)
        }
    }
    
    fun sendWebRTCAnswer(toId: String, sdp: String) {
        val roomId = _roomState.value.roomId
        if (roomId.isNotEmpty()) {
            socketClient.sendWebRTCAnswer(roomId, toId, sdp)
        }
    }
    
    fun sendWebRTCIce(toId: String, candidate: String, sdpMid: String?, sdpMLineIndex: Int?) {
        val roomId = _roomState.value.roomId
        if (roomId.isNotEmpty()) {
            socketClient.sendWebRTCIce(roomId, toId, candidate, sdpMid, sdpMLineIndex)
        }
    }
    
    // Host operations
    fun kickUser(targetId: String) {
        val roomId = _roomState.value.roomId
        if (roomId.isNotEmpty()) {
            socketClient.kickUser(roomId, targetId)
        }
    }
    
    // UI state updates
    fun updateVideoState(update: (VideoPlayerState) -> VideoPlayerState) {
        _roomState.update { it.copy(videoState = update(it.videoState)) }
    }
    
    fun setCallCollapsed(collapsed: Boolean) {
        _roomState.update { it.copy(isCallCollapsed = collapsed) }
    }
    
    fun setActivityCollapsed(collapsed: Boolean) {
        _roomState.update { it.copy(isActivityCollapsed = collapsed) }
    }
    
    fun clearError() {
        _roomState.update { it.copy(error = null) }
    }
    
    private fun resetState() {
        _roomState.value = RoomUiState()
        _participants.value = emptyList()
        _chatMessages.value = emptyList()
        _activityLog.value = emptyList()
        _wheelState.value = WheelState("", emptyList(), null)
    }
    
    private fun addActivityLogEntry(
        kind: ActivityLogKind,
        message: String,
        senderId: String?,
        senderName: String? = null
    ) {
        val entry = ActivityLogEntry(
            id = java.util.UUID.randomUUID().toString(),
            kind = kind,
            message = message,
            timestamp = System.currentTimeMillis(),
            senderId = senderId,
            senderName = senderName
        )
        _activityLog.update { current ->
            (current + entry).takeLast(100)
        }
    }
    
    private fun buildActivityMessage(event: ActivityEvent): String {
        return when (event.kind) {
            "join" -> "User joined"
            "leave" -> "User left"
            "sync" -> when (event.action) {
                "play" -> "Played video"
                "pause" -> "Paused video"
                "seek" -> "Seeked to ${formatTime(event.timestamp ?: 0.0)}"
                "change_url" -> "Changed video"
                else -> "Sync event"
            }
            else -> "Activity"
        }
    }
    
    private fun formatTime(seconds: Double): String {
        val totalSeconds = seconds.toInt()
        val hours = totalSeconds / 3600
        val minutes = (totalSeconds % 3600) / 60
        val secs = totalSeconds % 60
        
        return if (hours > 0) {
            String.format("%d:%02d:%02d", hours, minutes, secs)
        } else {
            String.format("%d:%02d", minutes, secs)
        }
    }
    
    private fun parseTimestamp(dateString: String): Long {
        return try {
            java.time.Instant.parse(dateString).toEpochMilli()
        } catch (e: Exception) {
            System.currentTimeMillis()
        }
    }
}
