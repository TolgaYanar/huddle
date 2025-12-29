package tv.wehuddle.app.data.repository

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
    
    // Expose socket connection state and events
    val connectionState: StateFlow<ConnectionState> = socketClient.connectionState
    val socketId: StateFlow<String?> = socketClient.socketId
    val socketEvents: SharedFlow<SocketEvent> = socketClient.events
    
    init {
        observeSocketEvents()
    }
    
    private fun observeSocketEvents() {
        scope.launch {
            socketClient.events.collect { event ->
                handleSocketEvent(event)
            }
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
                val participantsList = event.data.users.map { id ->
                    Participant(
                        id = id,
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
                        userId = currentUserId
                    )
                }
            }
            
            is SocketEvent.UserJoined -> {
                val newParticipant = Participant(id = event.data.socketId)
                _participants.update { current ->
                    if (current.none { it.id == event.data.socketId }) {
                        current + newParticipant
                    } else current
                }
                addActivityLogEntry(
                    kind = ActivityLogKind.JOIN,
                    message = "User joined",
                    senderId = event.data.socketId
                )
            }
            
            is SocketEvent.UserLeft -> {
                _participants.update { current ->
                    current.filter { it.id != event.data.socketId }
                }
                addActivityLogEntry(
                    kind = ActivityLogKind.LEAVE,
                    message = "User left",
                    senderId = event.data.socketId
                )
            }
            
            is SocketEvent.SyncEvent -> {
                val logKind = when (event.data.action) {
                    SyncAction.play -> ActivityLogKind.PLAY
                    SyncAction.pause -> ActivityLogKind.PAUSE
                    SyncAction.seek -> ActivityLogKind.SEEK
                    SyncAction.change_url -> ActivityLogKind.URL_CHANGE
                }
                
                _roomState.update { current ->
                    current.copy(
                        videoState = current.videoState.copy(
                            url = event.data.videoUrl ?: current.videoState.url,
                            currentTime = event.data.timestamp,
                            // Preserve playing state on seek, change it only on play/pause
                            isPlaying = when (event.data.action) {
                                SyncAction.play -> true
                                SyncAction.pause -> false
                                SyncAction.seek -> current.videoState.isPlaying
                                SyncAction.change_url -> false
                            }
                        )
                    )
                }
                
                addActivityLogEntry(
                    kind = logKind,
                    message = when (event.data.action) {
                        SyncAction.play -> "Played video"
                        SyncAction.pause -> "Paused video"
                        SyncAction.seek -> "Seeked to ${formatTime(event.data.timestamp)}"
                        SyncAction.change_url -> "Changed video"
                    },
                    senderId = event.data.senderId
                )
            }
            
            is SocketEvent.RoomState -> {
                _roomState.update { current ->
                    current.copy(
                        videoState = current.videoState.copy(
                            url = event.data.videoUrl ?: "",
                            currentTime = event.data.timestamp ?: 0.0,
                            isPlaying = event.data.action == SyncAction.play,
                            platform = detectPlatform(event.data.videoUrl ?: "")
                        )
                    )
                }
            }
            
            is SocketEvent.ChatMessageReceived -> {
                _chatMessages.update { current ->
                    current + event.data
                }
                addActivityLogEntry(
                    kind = ActivityLogKind.CHAT,
                    message = event.data.text,
                    senderId = event.data.senderId
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
                    senderId = event.data.senderId
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
                        senderId = activityEvent.senderId
                    )
                }
                _activityLog.value = entries
            }
            
            is SocketEvent.PasswordStatus -> {
                _roomState.update { it.copy(hasRoomPassword = event.data.hasPassword) }
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
        
        scope.launch {
            preferencesManager.saveLastRoomId(roomId)
        }
    }
    
    fun leaveRoom() {
        socketClient.leaveRoom()
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
        if (roomId.isNotEmpty()) {
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
                current.copy(
                    videoState = current.videoState.copy(
                        isPlaying = true,
                        currentTime = timestamp
                    )
                )
            }
        }
    }
    
    fun sendPauseEvent(timestamp: Double) {
        val roomId = _roomState.value.roomId
        if (roomId.isNotEmpty()) {
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
                current.copy(
                    videoState = current.videoState.copy(
                        isPlaying = false,
                        currentTime = timestamp
                    )
                )
            }
        }
    }
    
    fun sendSeekEvent(timestamp: Double) {
        val roomId = _roomState.value.roomId
        if (roomId.isNotEmpty()) {
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
        }
    }
    
    fun requestRoomState() {
        val roomId = _roomState.value.roomId
        if (roomId.isNotEmpty()) {
            socketClient.requestRoomState(roomId)
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
        if (roomId.isNotEmpty()) {
            socketClient.spinWheel(roomId)
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
        senderId: String?
    ) {
        val entry = ActivityLogEntry(
            id = java.util.UUID.randomUUID().toString(),
            kind = kind,
            message = message,
            timestamp = System.currentTimeMillis(),
            senderId = senderId
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
