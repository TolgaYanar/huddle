package tv.wehuddle.app.ui.screens.room

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
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
    
    private val _copied = MutableStateFlow(false)
    val copied: StateFlow<Boolean> = _copied.asStateFlow()
    
    init {
        connectToRoom()
        initializeWebRTC()

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
        viewModelScope.launch {
            webRTCManager.initialize()
            
            // Observe WebRTC signaling events from socket
            roomRepository.socketEvents.collect { event ->
                when (event) {
                    is SocketEvent.WebRTCOfferReceived -> {
                        webRTCManager.handleOffer(event.data.fromId, event.data)
                    }
                    is SocketEvent.WebRTCAnswerReceived -> {
                        webRTCManager.handleAnswer(event.data.fromId, event.data)
                    }
                    is SocketEvent.WebRTCIceReceived -> {
                        webRTCManager.handleIceCandidate(
                            event.data.fromId,
                            event.data
                        )
                    }
                    else -> {}
                }
            }
        }
    }
    
    override fun onCleared() {
        super.onCleared()
        roomRepository.leaveRoom()
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
        val entry = _wheelEntryInput.value.trim()
        if (entry.isNotEmpty()) {
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
        roomRepository.spinWheel()
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
    
    // Media state
    fun toggleMic() {
        val currentState = roomState.value.localMediaState
        val newMicState = !currentState.mic
        val newState = currentState.copy(mic = newMicState)
        
        // Toggle microphone in WebRTC manager
        webRTCManager.toggleMicrophone()
        
        roomRepository.sendMediaState(newState)
    }
    
    fun toggleCam() {
        val currentState = roomState.value.localMediaState
        val newCamState = !currentState.cam
        val newState = currentState.copy(cam = newCamState)
        
        viewModelScope.launch {
            if (newCamState) {
                // Start camera
                webRTCManager.startCamera()
            } else {
                // Stop camera
                webRTCManager.stopCamera()
            }
        }
        
        roomRepository.sendMediaState(newState)
    }
    
    fun toggleScreen() {
        val currentState = roomState.value.localMediaState
        val newState = currentState.copy(screen = !currentState.screen)
        roomRepository.sendMediaState(newState)
        // Screen share requires different handling - placeholder for now
    }
    
    // Host actions
    fun kickUser(targetId: String) {
        roomRepository.kickUser(targetId)
    }
    
    fun isHost(): Boolean {
        val state = roomState.value
        return state.userId.isNotEmpty() && state.hostId == state.userId
    }
}
