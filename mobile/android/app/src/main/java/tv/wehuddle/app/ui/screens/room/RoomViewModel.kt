package tv.wehuddle.app.ui.screens.room

import android.util.Log
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import tv.wehuddle.app.data.model.*
import tv.wehuddle.app.data.network.SocketEvent
import tv.wehuddle.app.data.repository.AuthRepository
import tv.wehuddle.app.data.repository.RoomRepository
import tv.wehuddle.app.data.repository.SavedRoomsRepository
import tv.wehuddle.app.data.webrtc.WebRTCManager
import javax.inject.Inject

@HiltViewModel
class RoomViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val roomRepository: RoomRepository,
    private val webRTCManager: WebRTCManager,
    private val authRepository: AuthRepository,
    private val savedRoomsRepository: SavedRoomsRepository
) : ViewModel() {
    
    val roomId: String = savedStateHandle.get<String>("roomId") ?: ""
    
    val roomState: StateFlow<RoomUiState> = roomRepository.roomState
    val connectionState: StateFlow<ConnectionState> = roomRepository.connectionState
    val participants: StateFlow<List<Participant>> = roomRepository.participants
    val chatMessages: StateFlow<List<ChatMessage>> = roomRepository.chatMessages
    val activityLog: StateFlow<List<ActivityLogEntry>> = roomRepository.activityLog
    val wheelState: StateFlow<WheelState> = roomRepository.wheelState
    val playlistState: StateFlow<PlaylistStateData> = roomRepository.playlistState

    val authUser: StateFlow<AuthUser?> = authRepository.user

    private val _isRoomSaved = MutableStateFlow(false)
    val isRoomSaved: StateFlow<Boolean> = _isRoomSaved.asStateFlow()

    private val _saveBusy = MutableStateFlow(false)
    val saveBusy: StateFlow<Boolean> = _saveBusy.asStateFlow()
    
    // WebRTC streams and context
    val localStream = webRTCManager.localStream
    val remoteStreams = webRTCManager.remoteStreams
    val eglContext = webRTCManager.eglContext
    
    // Local UI state
    private val _videoUrl = MutableStateFlow("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    val videoUrl: StateFlow<String> = _videoUrl.asStateFlow()
    
    private val _chatInput = MutableStateFlow("")
    val chatInput: StateFlow<String> = _chatInput.asStateFlow()
    
    private val _passwordInput = MutableStateFlow("")
    val passwordInput: StateFlow<String> = _passwordInput.asStateFlow()
    
    private val _showWheelPicker = MutableStateFlow(false)
    val showWheelPicker: StateFlow<Boolean> = _showWheelPicker.asStateFlow()
    
    private val _wheelEntryInput = MutableStateFlow("")
    val wheelEntryInput: StateFlow<String> = _wheelEntryInput.asStateFlow()
    
    private val _showPlaylistPanel = MutableStateFlow(false)
    val showPlaylistPanel: StateFlow<Boolean> = _showPlaylistPanel.asStateFlow()
    
    private val _copied = MutableStateFlow(false)
    val copied: StateFlow<Boolean> = _copied.asStateFlow()

    private val _callError = MutableStateFlow<String?>(null)
    val callError: StateFlow<String?> = _callError.asStateFlow()
    
    init {
        // WebRTC listeners must exist before the socket joins. Otherwise an
        // offer emitted immediately after room_users can be lost because the
        // SocketClient signaling flow intentionally has no replay cache.
        initializeWebRTC()
        connectToRoom()

        viewModelScope.launch {
            authRepository.user.collect { user ->
                if (user == null) {
                    _isRoomSaved.value = false
                    return@collect
                }
                refreshSavedStatus()
            }
        }
    }

    private fun refreshSavedStatus() {
        viewModelScope.launch {
            try {
                val rooms = savedRoomsRepository.list()
                _isRoomSaved.value = rooms.contains(roomId)
            } catch (_: Exception) {
                // ignore
            }
        }
    }

    fun toggleSaveRoom() {
        if (authRepository.user.value == null) return
        if (_saveBusy.value) return

        viewModelScope.launch {
            _saveBusy.value = true
            try {
                val currentlySaved = _isRoomSaved.value
                if (currentlySaved) {
                    savedRoomsRepository.unsave(roomId)
                    _isRoomSaved.value = false
                } else {
                    savedRoomsRepository.save(roomId)
                    _isRoomSaved.value = true
                }
            } catch (_: Exception) {
                // ignore
            } finally {
                _saveBusy.value = false
            }
        }
    }
    
    private fun connectToRoom() {
        // Warm the short-lived ICE credential in parallel. Signaling handlers
        // await the same repository gate before creating the first peer, while
        // chat and room state do not pay the network timeout.
        viewModelScope.launch { webRTCManager.prepareIceServers() }
        roomRepository.connect()

        viewModelScope.launch {
            // Wait for connection then join room
            roomRepository.connectionState
                .filter { it == ConnectionState.CONNECTED }
                .take(1)
                .collect {
                    roomRepository.joinRoom(roomId)
                    roomRepository.requestRoomState()
                    roomRepository.requestChatHistory()
                    roomRepository.requestActivityHistory()
                    roomRepository.requestWheelState()
                }
        }
        
        // Sync video URL from room state
        viewModelScope.launch {
            roomRepository.roomState.collect { state ->
                if (state.videoState.url.isNotEmpty() && _videoUrl.value.isEmpty()) {
                    _videoUrl.value = state.videoState.url
                }
            }
        }
    }
    
    private fun initializeWebRTC() {
        viewModelScope.launch(start = CoroutineStart.UNDISPATCHED) {
            // StateFlow changes synchronously even when Socket.IO's close
            // callback is removed during auth-token reconnect. Any transport
            // state outside CONNECTED is therefore an immediate capture gate.
            roomRepository.connectionState
                .distinctUntilChanged()
                .collect { state ->
                    if (state != ConnectionState.CONNECTED) {
                        stopCallForMembershipLoss()
                    }
                }
        }

        viewModelScope.launch(start = CoroutineStart.UNDISPATCHED) {
            // Observe WebRTC signaling events from socket (incoming)
            roomRepository.socketEvents.collect { event ->
                when (event) {
                    is SocketEvent.RoomUsers -> {
                        if (event.data.roomId != roomId) return@collect
                        val socketId = roomRepository.socketId.value
                            ?.takeIf(String::isNotBlank)
                            ?: return@collect
                        // Only the private post-join snapshot carries this
                        // token. Later room-wide snapshots intentionally omit
                        // it, so retain the last valid token until disconnect.
                        event.data.iceAccessToken?.let { token ->
                            webRTCManager.updateIceAccess(roomId, socketId, token)
                        }
                    }
                    is SocketEvent.Disconnected -> {
                        stopCallForMembershipLoss()
                    }
                    is SocketEvent.PasswordRequired -> {
                        if (event.data.roomId != roomId) return@collect
                        stopCallForMembershipLoss()
                    }
                    is SocketEvent.RoomBanned -> {
                        if (event.roomId != roomId) return@collect
                        stopCallForMembershipLoss()
                    }
                    is SocketEvent.WebRTCOfferReceived -> {
                        if (event.data.roomId != roomId) return@collect
                        Log.d("RoomViewModel", "Received WebRTC offer from ${event.data.fromId}")
                        webRTCManager.handleOffer(event.data.fromId, event.data)
                    }
                    is SocketEvent.WebRTCAnswerReceived -> {
                        if (event.data.roomId != roomId) return@collect
                        Log.d("RoomViewModel", "Received WebRTC answer from ${event.data.fromId}")
                        webRTCManager.handleAnswer(event.data.fromId, event.data)
                    }
                    is SocketEvent.WebRTCIceReceived -> {
                        if (event.data.roomId != roomId) return@collect
                        Log.d("RoomViewModel", "Received ICE candidate from ${event.data.fromId}")
                        webRTCManager.handleIceCandidate(
                            event.data.fromId,
                            event.data
                        )
                    }
                    else -> {}
                }
            }
        }
        
        // Observe WebRTC events from manager (outgoing) and send to server
        viewModelScope.launch(start = CoroutineStart.UNDISPATCHED) {
            webRTCManager.events.collect { event ->
                when (event) {
                    is tv.wehuddle.app.data.webrtc.WebRTCEvent.AnswerCreated -> {
                        Log.d("RoomViewModel", "Sending WebRTC answer to ${event.peerId}")
                        roomRepository.sendWebRTCAnswer(
                            roomId,
                            event.peerId,
                            event.sdp.description,
                            event.generation,
                        )
                    }
                    is tv.wehuddle.app.data.webrtc.WebRTCEvent.OfferCreated -> {
                        Log.d("RoomViewModel", "Sending WebRTC offer to ${event.peerId}")
                        roomRepository.sendWebRTCOffer(
                            roomId,
                            event.peerId,
                            event.sdp.description,
                            event.generation,
                        )
                    }
                    is tv.wehuddle.app.data.webrtc.WebRTCEvent.IceCandidateGenerated -> {
                        Log.d("RoomViewModel", "Sending ICE candidate to ${event.peerId}")
                        roomRepository.sendWebRTCIce(
                            roomId,
                            event.peerId,
                            event.candidate.sdp,
                            event.candidate.sdpMid,
                            event.candidate.sdpMLineIndex,
                            event.generation,
                        )
                    }
                    is tv.wehuddle.app.data.webrtc.WebRTCEvent.RemoteStreamAdded -> {
                        Log.d("RoomViewModel", "Remote stream added for ${event.peerId}")
                    }
                    is tv.wehuddle.app.data.webrtc.WebRTCEvent.RemoteStreamRemoved -> {
                        Log.d("RoomViewModel", "Remote stream removed for ${event.peerId}")
                    }
                    is tv.wehuddle.app.data.webrtc.WebRTCEvent.ConnectionStateChanged -> {
                        Log.d("RoomViewModel", "Connection state changed for ${event.peerId}: ${event.state}")
                    }
                    is tv.wehuddle.app.data.webrtc.WebRTCEvent.LocalSpeakingChanged -> {
                        roomRepository.sendSpeakingState(roomId, event.speaking)
                    }
                    is tv.wehuddle.app.data.webrtc.WebRTCEvent.Error -> {
                        Log.e("RoomViewModel", "WebRTC error: ${event.message}")
                        // Runtime camera/microphone failures can happen after a
                        // successful toggle. Publish the manager's real state,
                        // never the last optimistic button state.
                        roomRepository.sendMediaState(roomId, webRTCManager.localMediaState.value)
                        _callError.value = event.message
                    }
                    else -> {}
                }
            }
        }

        // RoomRepository subscribes to socket events eagerly and exposes the
        // latest participant snapshot as StateFlow. Reconciling from that
        // snapshot both survives an early room_users event and closes peers
        // that leave. The lexical rule is shared with the web client, so one
        // side always creates the initial offer regardless of socket-id order.
        viewModelScope.launch(start = CoroutineStart.UNDISPATCHED) {
            combine(
                roomRepository.participants,
                roomRepository.socketId,
                roomRepository.roomState,
            ) { participants, socketId, state ->
                Triple(socketId, state.roomId, participants.map(Participant::id).sorted())
            }
                .distinctUntilChanged()
                .collectLatest { (socketId, activeRoomId, participantIds) ->
                    if (socketId.isNullOrBlank() || activeRoomId != roomId) {
                        webRTCManager.closeAllPeerConnections()
                    } else {
                        if (socketId in participantIds) {
                            // The server forgets per-socket call state on a
                            // disconnect. Re-advertise capture and speaking
                            // state after every successful join/rejoin.
                            roomRepository.sendMediaState(roomId, webRTCManager.localMediaState.value)
                            roomRepository.sendSpeakingState(roomId, webRTCManager.localSpeaking.value)
                        }
                        webRTCManager.reconcilePeers(socketId, participantIds)
                    }
                }
        }

        // Initialize only after both signaling directions are subscribed, so
        // even an immediate native initialization error reaches the UI.
        webRTCManager.initialize()
    }
    
    override fun onCleared() {
        super.onCleared()
        roomRepository.leaveRoom(roomId)
        webRTCManager.release()
    }
    
    // Video control actions
    fun updateVideoUrl(url: String) {
        _videoUrl.value = url
    }
    
    fun loadVideo() {
        val url = _videoUrl.value.trim()
        if (url.isNotEmpty()) {
            roomRepository.sendUrlChangeEvent(url)
        }
    }
    
    fun onPlay(timestamp: Double) {
        roomRepository.sendPlayEvent(timestamp)
    }
    
    fun onPause(timestamp: Double) {
        roomRepository.sendPauseEvent(timestamp)
    }
    
    fun onSeek(timestamp: Double) {
        roomRepository.sendSeekEvent(timestamp)
    }

    /**
     * Request sync from room - useful for TV when playback drifts
     */
    fun requestSync() {
        roomRepository.requestSync()
    }

    fun setMuted(isMuted: Boolean) {
        roomRepository.sendMuteEvent(isMuted)
    }

    fun setPlaybackSpeed(speed: Float) {
        roomRepository.sendPlaybackSpeedEvent(speed)
    }

    fun setVolume(volume: Float) {
        roomRepository.sendVolumeEvent(volume)
    }

    fun setAudioSyncEnabled(enabled: Boolean) {
        roomRepository.setAudioSyncEnabled(enabled)
    }
    
    fun updateVideoState(update: (VideoPlayerState) -> VideoPlayerState) {
        roomRepository.updateVideoState(update)
    }
    
    // Chat actions
    fun updateChatInput(text: String) {
        _chatInput.value = text
    }
    
    fun sendChatMessage() {
        val text = _chatInput.value.trim()
        if (text.isNotEmpty()) {
            roomRepository.sendChatMessage(text)
            _chatInput.value = ""
        }
    }
    
    // Password actions
    fun updatePasswordInput(password: String) {
        _passwordInput.value = password
    }
    
    fun submitPassword() {
        val password = _passwordInput.value
        if (password.isNotEmpty()) {
            roomRepository.submitPassword(password)
            _passwordInput.value = ""
        }
    }
    
    fun setRoomPassword(password: String) {
        roomRepository.setRoomPassword(password)
    }
    
    // Wheel picker actions
    fun toggleWheelPicker() {
        _showWheelPicker.update { !it }
    }
    
    fun closeWheelPicker() {
        _showWheelPicker.value = false
    }
    
    fun updateWheelEntryInput(text: String) {
        _wheelEntryInput.value = text
    }
    
    fun addWheelEntry() {
        Log.d("WheelPicker", "addWheelEntry called")
        val entry = _wheelEntryInput.value.trim()
        Log.d("WheelPicker", "Entry input: '$entry'")
        if (entry.isNotEmpty()) {
            Log.d("WheelPicker", "Sending entry to repository")
            roomRepository.addWheelEntry(entry)
            _wheelEntryInput.value = ""
        }
    }
    
    fun removeWheelEntry(index: Int) {
        roomRepository.removeWheelEntry(index)
    }
    
    fun clearWheelEntries() {
        roomRepository.clearWheelEntries()
    }
    
    fun spinWheel() {
        Log.d("WheelPicker", "spinWheel called")
        roomRepository.spinWheel()
    }
    
    // Playlist UI actions
    fun openPlaylistPanel() {
        _showPlaylistPanel.value = true
        roomRepository.requestPlaylistState()
    }
    
    fun closePlaylistPanel() {
        _showPlaylistPanel.value = false
    }
    
    fun createPlaylist(name: String, description: String? = null) {
        roomRepository.createPlaylist(name, description)
    }
    
    fun updatePlaylist(playlistId: String, name: String? = null, description: String? = null, settings: PlaylistSettings? = null) {
        roomRepository.updatePlaylist(playlistId, name, description, settings)
    }
    
    fun deletePlaylist(playlistId: String) {
        roomRepository.deletePlaylist(playlistId)
    }
    
    fun addPlaylistItem(playlistId: String, videoUrl: String, title: String? = null, duration: Double? = null, thumbnail: String? = null) {
        roomRepository.addPlaylistItem(playlistId, videoUrl, title, duration, thumbnail)
    }
    
    fun removePlaylistItem(playlistId: String, itemId: String) {
        roomRepository.removePlaylistItem(playlistId, itemId)
    }
    
    fun setActivePlaylist(playlistId: String?) {
        roomRepository.setActivePlaylist(playlistId)
    }
    
    fun playPlaylistItem(playlistId: String, itemId: String) {
        roomRepository.playPlaylistItem(playlistId, itemId)
    }
    
    fun playNextInPlaylist() {
        roomRepository.playNextInPlaylist()
    }
    
    fun playPreviousInPlaylist() {
        roomRepository.playPreviousInPlaylist()
    }
    
    // UI actions
    fun setCallCollapsed(collapsed: Boolean) {
        roomRepository.setCallCollapsed(collapsed)
    }
    
    fun setActivityCollapsed(collapsed: Boolean) {
        roomRepository.setActivityCollapsed(collapsed)
    }
    
    fun setCopied(copied: Boolean) {
        _copied.value = copied
        if (copied) {
            viewModelScope.launch {
                kotlinx.coroutines.delay(2000)
                _copied.value = false
            }
        }
    }
    
    fun getInviteLink(): String {
        return "https://wehuddle.tv/r/$roomId"
    }
    
    fun clearError() {
        roomRepository.clearError()
    }

    fun clearCallError() {
        _callError.value = null
    }

    /** Stop both capture and playout while the room screen is not visible. */
    fun suspendCall() {
        val canPublish = hasActiveRoomMembership()
        webRTCManager.closeAllPeerConnections()
        webRTCManager.stopCamera()
        webRTCManager.stopMicrophone()
        if (canPublish) {
            roomRepository.sendMediaState(roomId, webRTCManager.localMediaState.value)
            roomRepository.sendSpeakingState(roomId, false)
        } else {
            roomRepository.clearLocalCallState()
        }
    }

    /** Restore remote playout on return; local capture stays opt-in and off. */
    fun resumeCall() {
        if (!hasActiveRoomMembership()) return
        val socketId = roomRepository.socketId.value ?: return
        val participantIds = roomRepository.participants.value.map(Participant::id)
        viewModelScope.launch {
            webRTCManager.reconcilePeers(socketId, participantIds)
        }
    }
    
    // Re-sync: request current room state without broadcasting changes
    fun requestResync() {
        roomRepository.requestRoomState()
    }
    
    // Media state
    fun toggleMic() {
        if (!hasActiveRoomMembership()) {
            _callError.value = "Join the room before turning on your microphone"
            return
        }
        // Publish the state that native capture actually reached. Previously
        // a permission/capture failure still told everyone that the mic was on.
        _callError.value = null
        webRTCManager.toggleMicrophone()
        roomRepository.sendMediaState(roomId, webRTCManager.localMediaState.value)
    }
    
    fun toggleCam() {
        if (!hasActiveRoomMembership()) {
            _callError.value = "Join the room before turning on your camera"
            return
        }
        _callError.value = null
        viewModelScope.launch {
            webRTCManager.toggleCamera()
            roomRepository.sendMediaState(roomId, webRTCManager.localMediaState.value)
        }
    }
    
    fun toggleScreen() {
        // Android screen capture needs a MediaProjection permission flow and
        // a foreground service. Do not advertise a stream that does not exist.
        Log.w("RoomViewModel", "Screen sharing is not available on Android yet")
    }
    
    // Host actions
    fun kickUser(targetId: String) {
        roomRepository.kickUser(targetId)
    }
    
    fun isHost(): Boolean {
        val state = roomState.value
        return state.userId.isNotEmpty() && state.hostId == state.userId
    }

    private fun hasActiveRoomMembership(): Boolean {
        val state = roomState.value
        val socketId = roomRepository.socketId.value
        return connectionState.value == ConnectionState.CONNECTED &&
            state.roomId == roomId &&
            state.userId.isNotBlank() &&
            state.userId == socketId
    }

    private fun stopCallForMembershipLoss() {
        // A protected, banned, or disconnected client must never keep hidden
        // capture alive while it is outside the room membership boundary.
        webRTCManager.closeAllPeerConnections()
        webRTCManager.stopCamera()
        webRTCManager.stopMicrophone()
        webRTCManager.clearIceAccess()
        roomRepository.clearLocalCallState()
    }
}
