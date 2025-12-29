package tv.wehuddle.app.data.webrtc

import android.content.Context
import android.util.Log
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.webrtc.*
import tv.wehuddle.app.data.model.WebRTCOffer
import tv.wehuddle.app.data.model.WebRTCAnswer
import tv.wehuddle.app.data.model.WebRTCIceCandidate
import tv.wehuddle.app.data.model.WebRTCMediaState
import javax.inject.Inject
import javax.inject.Singleton

/**
 * WebRTC event types emitted by the WebRTC manager
 */
sealed class WebRTCEvent {
    data class LocalStreamReady(val stream: MediaStream) : WebRTCEvent()
    data class RemoteStreamAdded(val peerId: String, val stream: MediaStream) : WebRTCEvent()
    data class RemoteStreamRemoved(val peerId: String) : WebRTCEvent()
    data class IceCandidateGenerated(val peerId: String, val candidate: IceCandidate) : WebRTCEvent()
    data class OfferCreated(val peerId: String, val sdp: SessionDescription) : WebRTCEvent()
    data class AnswerCreated(val peerId: String, val sdp: SessionDescription) : WebRTCEvent()
    data class ConnectionStateChanged(val peerId: String, val state: PeerConnection.PeerConnectionState) : WebRTCEvent()
    data class Error(val message: String) : WebRTCEvent()
}

/**
 * Manages WebRTC peer connections for video/audio calls
 */
@Singleton
class WebRTCManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    companion object {
        private const val TAG = "WebRTCManager"
        
        private val ICE_SERVERS = listOf(
            PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer(),
            PeerConnection.IceServer.builder("stun:stun1.l.google.com:19302").createIceServer(),
            PeerConnection.IceServer.builder("stun:stun2.l.google.com:19302").createIceServer(),
            PeerConnection.IceServer.builder("stun:stun3.l.google.com:19302").createIceServer(),
            PeerConnection.IceServer.builder("stun:stun4.l.google.com:19302").createIceServer()
        )
    }
    
    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    
    private var peerConnectionFactory: PeerConnectionFactory? = null
    private val peerConnections = mutableMapOf<String, PeerConnection>()
    private val pendingIceCandidates = mutableMapOf<String, MutableList<IceCandidate>>()
    
    private var localAudioTrack: AudioTrack? = null
    private var localVideoTrack: VideoTrack? = null
    private var localScreenTrack: VideoTrack? = null
    private var localMediaStream: MediaStream? = null

    private val _localStream = MutableStateFlow<MediaStream?>(null)
    val localStream: StateFlow<MediaStream?> = _localStream.asStateFlow()

    private val _eglContext = MutableStateFlow<EglBase.Context?>(null)
    val eglContext: StateFlow<EglBase.Context?> = _eglContext.asStateFlow()
    
    private var videoCapturer: CameraVideoCapturer? = null
    private var surfaceTextureHelper: SurfaceTextureHelper? = null
    private var eglBase: EglBase? = null
    
    private val _events = MutableSharedFlow<WebRTCEvent>(replay = 0, extraBufferCapacity = 64)
    val events: SharedFlow<WebRTCEvent> = _events.asSharedFlow()
    
    private val _localMediaState = MutableStateFlow(WebRTCMediaState())
    val localMediaState: StateFlow<WebRTCMediaState> = _localMediaState.asStateFlow()
    
    private val _remoteStreams = MutableStateFlow<Map<String, MediaStream>>(emptyMap())
    val remoteStreams: StateFlow<Map<String, MediaStream>> = _remoteStreams.asStateFlow()
    
    private var isInitialized = false
    
    /**
     * Initialize the WebRTC factory. Must be called before any other operations.
     */
    fun initialize() {
        if (isInitialized) return
        
        try {
            // Initialize WebRTC
            val options = PeerConnectionFactory.InitializationOptions.builder(context)
                .setEnableInternalTracer(true)
                .createInitializationOptions()
            PeerConnectionFactory.initialize(options)
            
            // Create EGL context
            eglBase = EglBase.create()
            _eglContext.value = eglBase?.eglBaseContext
            
            // Create factory
            val encoderFactory = DefaultVideoEncoderFactory(
                eglBase?.eglBaseContext,
                true,
                true
            )
            val decoderFactory = DefaultVideoDecoderFactory(eglBase?.eglBaseContext)
            
            peerConnectionFactory = PeerConnectionFactory.builder()
                .setVideoEncoderFactory(encoderFactory)
                .setVideoDecoderFactory(decoderFactory)
                .setOptions(PeerConnectionFactory.Options())
                .createPeerConnectionFactory()
            
            isInitialized = true
            Log.d(TAG, "WebRTC initialized successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize WebRTC", e)
            emitEvent(WebRTCEvent.Error("Failed to initialize WebRTC: ${e.message}"))
        }
    }
    
    /**
     * Get the EGL base context for rendering
     */
    fun getEglBaseContext(): EglBase.Context? = eglBase?.eglBaseContext
    
    /**
     * Start capturing from the camera
     */
    fun startCamera(localVideoSink: VideoSink? = null): Boolean {
        if (!isInitialized || peerConnectionFactory == null) {
            Log.e(TAG, "WebRTC not initialized")
            return false
        }
        
        try {
            // Create video capturer
            videoCapturer = createCameraCapturer()
            if (videoCapturer == null) {
                Log.e(TAG, "Failed to create camera capturer")
                return false
            }
            
            // Create surface texture helper
            surfaceTextureHelper = SurfaceTextureHelper.create("CaptureThread", eglBase?.eglBaseContext)
            
            // Create video source
            val videoSource = peerConnectionFactory!!.createVideoSource(videoCapturer!!.isScreencast)
            videoCapturer!!.initialize(surfaceTextureHelper, context, videoSource.capturerObserver)
            videoCapturer!!.startCapture(640, 480, 30)
            
            // Create video track
            localVideoTrack = peerConnectionFactory!!.createVideoTrack("video0", videoSource)
            localVideoTrack?.setEnabled(true)
            
            // Add sink for local preview
            localVideoSink?.let { localVideoTrack?.addSink(it) }
            
            _localMediaState.value = _localMediaState.value.copy(cam = true)
            rebuildLocalStream()
            Log.d(TAG, "Camera started successfully")
            return true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start camera", e)
            emitEvent(WebRTCEvent.Error("Failed to start camera: ${e.message}"))
            return false
        }
    }
    
    /**
     * Stop the camera
     */
    fun stopCamera() {
        try {
            videoCapturer?.stopCapture()
            videoCapturer?.dispose()
            videoCapturer = null
            
            localVideoTrack?.dispose()
            localVideoTrack = null
            
            surfaceTextureHelper?.dispose()
            surfaceTextureHelper = null
            
            _localMediaState.value = _localMediaState.value.copy(cam = false)
            rebuildLocalStream()
            Log.d(TAG, "Camera stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping camera", e)
        }
    }
    
    /**
     * Start microphone capture
     */
    fun startMicrophone(): Boolean {
        if (!isInitialized || peerConnectionFactory == null) {
            Log.e(TAG, "WebRTC not initialized")
            return false
        }
        
        try {
            val audioConstraints = MediaConstraints().apply {
                mandatory.add(MediaConstraints.KeyValuePair("googEchoCancellation", "true"))
                mandatory.add(MediaConstraints.KeyValuePair("googNoiseSuppression", "true"))
                mandatory.add(MediaConstraints.KeyValuePair("googAutoGainControl", "true"))
            }
            
            val audioSource = peerConnectionFactory!!.createAudioSource(audioConstraints)
            localAudioTrack = peerConnectionFactory!!.createAudioTrack("audio0", audioSource)
            localAudioTrack?.setEnabled(true)
            
            _localMediaState.value = _localMediaState.value.copy(mic = true)
            rebuildLocalStream()
            Log.d(TAG, "Microphone started successfully")
            return true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start microphone", e)
            emitEvent(WebRTCEvent.Error("Failed to start microphone: ${e.message}"))
            return false
        }
    }
    
    /**
     * Stop microphone
     */
    fun stopMicrophone() {
        try {
            localAudioTrack?.setEnabled(false)
            localAudioTrack?.dispose()
            localAudioTrack = null
            
            _localMediaState.value = _localMediaState.value.copy(mic = false)
            rebuildLocalStream()
            Log.d(TAG, "Microphone stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping microphone", e)
        }
    }
    
    /**
     * Toggle microphone mute state
     */
    fun toggleMicrophone(): Boolean {
        return if (_localMediaState.value.mic) {
            stopMicrophone()
            false
        } else {
            startMicrophone()
        }
    }

    private fun rebuildLocalStream() {
        localMediaStream?.dispose()

        val newStream = peerConnectionFactory?.createLocalMediaStream("local-stream")
        localAudioTrack?.let { newStream?.addTrack(it) }
        localVideoTrack?.let { newStream?.addTrack(it) }

        localMediaStream = newStream
        _localStream.value = newStream
    }
    
    /**
     * Toggle camera state
     */
    fun toggleCamera(localVideoSink: VideoSink? = null): Boolean {
        return if (_localMediaState.value.cam) {
            stopCamera()
            false
        } else {
            startCamera(localVideoSink)
        }
    }
    
    /**
     * Switch between front and back camera
     */
    fun switchCamera() {
        videoCapturer?.switchCamera(object : CameraVideoCapturer.CameraSwitchHandler {
            override fun onCameraSwitchDone(isFrontCamera: Boolean) {
                Log.d(TAG, "Camera switched, front: $isFrontCamera")
            }
            
            override fun onCameraSwitchError(error: String?) {
                Log.e(TAG, "Camera switch error: $error")
            }
        })
    }
    
    /**
     * Create or get a peer connection for a given peer ID
     */
    fun getOrCreatePeerConnection(peerId: String): PeerConnection? {
        peerConnections[peerId]?.let { return it }
        
        if (!isInitialized || peerConnectionFactory == null) {
            Log.e(TAG, "WebRTC not initialized")
            return null
        }
        
        val rtcConfig = PeerConnection.RTCConfiguration(ICE_SERVERS).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
        }
        
        val peerConnection = peerConnectionFactory!!.createPeerConnection(
            rtcConfig,
            createPeerConnectionObserver(peerId)
        )
        
        if (peerConnection == null) {
            Log.e(TAG, "Failed to create peer connection for $peerId")
            return null
        }
        
        // Add local tracks if available
        localAudioTrack?.let { track ->
            peerConnection.addTrack(track, listOf("local-stream"))
        }
        localVideoTrack?.let { track ->
            peerConnection.addTrack(track, listOf("local-stream"))
        }

        // Ensure local stream reflects current tracks
        rebuildLocalStream()
        
        peerConnections[peerId] = peerConnection
        pendingIceCandidates[peerId] = mutableListOf()
        
        Log.d(TAG, "Created peer connection for $peerId")
        return peerConnection
    }
    
    /**
     * Create an offer for a peer
     */
    fun createOffer(peerId: String) {
        val peerConnection = getOrCreatePeerConnection(peerId) ?: return
        
        val constraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", "true"))
        }
        
        peerConnection.createOffer(object : SdpObserver {
            override fun onCreateSuccess(sdp: SessionDescription) {
                peerConnection.setLocalDescription(object : SdpObserver {
                    override fun onCreateSuccess(p0: SessionDescription?) {}
                    override fun onSetSuccess() {
                        Log.d(TAG, "Local description set for $peerId")
                        emitEvent(WebRTCEvent.OfferCreated(peerId, sdp))
                    }
                    override fun onCreateFailure(error: String?) {}
                    override fun onSetFailure(error: String?) {
                        Log.e(TAG, "Failed to set local description: $error")
                    }
                }, sdp)
            }
            override fun onSetSuccess() {}
            override fun onCreateFailure(error: String?) {
                Log.e(TAG, "Failed to create offer: $error")
                emitEvent(WebRTCEvent.Error("Failed to create offer: $error"))
            }
            override fun onSetFailure(error: String?) {}
        }, constraints)
    }
    
    /**
     * Handle an incoming offer
     */
    fun handleOffer(peerId: String, offer: WebRTCOffer) {
        val peerConnection = getOrCreatePeerConnection(peerId) ?: return
        
        val sdp = SessionDescription(SessionDescription.Type.OFFER, offer.sdp)
        
        peerConnection.setRemoteDescription(object : SdpObserver {
            override fun onCreateSuccess(p0: SessionDescription?) {}
            override fun onSetSuccess() {
                Log.d(TAG, "Remote description set for $peerId")
                
                // Apply any pending ICE candidates
                pendingIceCandidates[peerId]?.forEach { candidate ->
                    peerConnection.addIceCandidate(candidate)
                }
                pendingIceCandidates[peerId]?.clear()
                
                // Create answer
                createAnswer(peerId)
            }
            override fun onCreateFailure(error: String?) {}
            override fun onSetFailure(error: String?) {
                Log.e(TAG, "Failed to set remote description: $error")
            }
        }, sdp)
    }
    
    /**
     * Create an answer for a peer
     */
    private fun createAnswer(peerId: String) {
        val peerConnection = peerConnections[peerId] ?: return
        
        val constraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", "true"))
        }
        
        peerConnection.createAnswer(object : SdpObserver {
            override fun onCreateSuccess(sdp: SessionDescription) {
                peerConnection.setLocalDescription(object : SdpObserver {
                    override fun onCreateSuccess(p0: SessionDescription?) {}
                    override fun onSetSuccess() {
                        Log.d(TAG, "Local answer set for $peerId")
                        emitEvent(WebRTCEvent.AnswerCreated(peerId, sdp))
                    }
                    override fun onCreateFailure(error: String?) {}
                    override fun onSetFailure(error: String?) {
                        Log.e(TAG, "Failed to set local answer: $error")
                    }
                }, sdp)
            }
            override fun onSetSuccess() {}
            override fun onCreateFailure(error: String?) {
                Log.e(TAG, "Failed to create answer: $error")
            }
            override fun onSetFailure(error: String?) {}
        }, constraints)
    }
    
    /**
     * Handle an incoming answer
     */
    fun handleAnswer(peerId: String, answer: WebRTCAnswer) {
        val peerConnection = peerConnections[peerId] ?: return
        
        val sdp = SessionDescription(SessionDescription.Type.ANSWER, answer.sdp)
        
        peerConnection.setRemoteDescription(object : SdpObserver {
            override fun onCreateSuccess(p0: SessionDescription?) {}
            override fun onSetSuccess() {
                Log.d(TAG, "Remote answer set for $peerId")
                
                // Apply any pending ICE candidates
                pendingIceCandidates[peerId]?.forEach { candidate ->
                    peerConnection.addIceCandidate(candidate)
                }
                pendingIceCandidates[peerId]?.clear()
            }
            override fun onCreateFailure(error: String?) {}
            override fun onSetFailure(error: String?) {
                Log.e(TAG, "Failed to set remote answer: $error")
            }
        }, sdp)
    }
    
    /**
     * Handle an incoming ICE candidate
     */
    fun handleIceCandidate(peerId: String, candidate: WebRTCIceCandidate) {
        val iceCandidate = IceCandidate(
            candidate.sdpMid ?: "",
            candidate.sdpMLineIndex ?: 0,
            candidate.candidate
        )
        
        val peerConnection = peerConnections[peerId]
        if (peerConnection?.remoteDescription != null) {
            peerConnection.addIceCandidate(iceCandidate)
        } else {
            // Queue the candidate for later
            pendingIceCandidates.getOrPut(peerId) { mutableListOf() }.add(iceCandidate)
        }
    }
    
    /**
     * Close a specific peer connection
     */
    fun closePeerConnection(peerId: String) {
        peerConnections[peerId]?.let { pc ->
            pc.close()
            pc.dispose()
        }
        peerConnections.remove(peerId)
        pendingIceCandidates.remove(peerId)
        
        val updatedStreams = _remoteStreams.value.toMutableMap()
        updatedStreams.remove(peerId)
        _remoteStreams.value = updatedStreams
        
        emitEvent(WebRTCEvent.RemoteStreamRemoved(peerId))
        Log.d(TAG, "Closed peer connection for $peerId")
    }
    
    /**
     * Close all peer connections
     */
    fun closeAllPeerConnections() {
        peerConnections.keys.toList().forEach { peerId ->
            closePeerConnection(peerId)
        }
    }
    
    /**
     * Release all resources
     */
    fun release() {
        stopCamera()
        stopMicrophone()
        closeAllPeerConnections()
        
        localMediaStream?.dispose()
        localMediaStream = null
        _localStream.value = null
        
        peerConnectionFactory?.dispose()
        peerConnectionFactory = null
        
        eglBase?.release()
        eglBase = null
        _eglContext.value = null
        
        isInitialized = false
        Log.d(TAG, "WebRTC resources released")
    }
    
    private fun createCameraCapturer(): CameraVideoCapturer? {
        val enumerator = Camera2Enumerator(context)
        
        // Try front camera first
        for (deviceName in enumerator.deviceNames) {
            if (enumerator.isFrontFacing(deviceName)) {
                val capturer = enumerator.createCapturer(deviceName, null)
                if (capturer != null) return capturer
            }
        }
        
        // Fall back to back camera
        for (deviceName in enumerator.deviceNames) {
            if (!enumerator.isFrontFacing(deviceName)) {
                val capturer = enumerator.createCapturer(deviceName, null)
                if (capturer != null) return capturer
            }
        }
        
        return null
    }
    
    private fun createPeerConnectionObserver(peerId: String) = object : PeerConnection.Observer {
        override fun onSignalingChange(state: PeerConnection.SignalingState?) {
            Log.d(TAG, "Signaling state changed for $peerId: $state")
        }
        
        override fun onIceConnectionChange(state: PeerConnection.IceConnectionState?) {
            Log.d(TAG, "ICE connection state changed for $peerId: $state")
        }
        
        override fun onIceConnectionReceivingChange(receiving: Boolean) {
            Log.d(TAG, "ICE connection receiving changed for $peerId: $receiving")
        }
        
        override fun onIceGatheringChange(state: PeerConnection.IceGatheringState?) {
            Log.d(TAG, "ICE gathering state changed for $peerId: $state")
        }
        
        override fun onIceCandidate(candidate: IceCandidate?) {
            candidate?.let {
                Log.d(TAG, "ICE candidate generated for $peerId")
                emitEvent(WebRTCEvent.IceCandidateGenerated(peerId, it))
            }
        }
        
        override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) {
            Log.d(TAG, "ICE candidates removed for $peerId")
        }
        
        override fun onAddStream(stream: MediaStream?) {
            Log.d(TAG, "Stream added for $peerId")
            stream?.let {
                val updatedStreams = _remoteStreams.value.toMutableMap()
                updatedStreams[peerId] = it
                _remoteStreams.value = updatedStreams
                emitEvent(WebRTCEvent.RemoteStreamAdded(peerId, it))
            }
        }
        
        override fun onRemoveStream(stream: MediaStream?) {
            Log.d(TAG, "Stream removed for $peerId")
            val updatedStreams = _remoteStreams.value.toMutableMap()
            updatedStreams.remove(peerId)
            _remoteStreams.value = updatedStreams
            emitEvent(WebRTCEvent.RemoteStreamRemoved(peerId))
        }
        
        override fun onDataChannel(channel: DataChannel?) {
            Log.d(TAG, "Data channel for $peerId: ${channel?.label()}")
        }
        
        override fun onRenegotiationNeeded() {
            Log.d(TAG, "Renegotiation needed for $peerId")
        }
        
        override fun onAddTrack(receiver: RtpReceiver?, streams: Array<out MediaStream>?) {
            Log.d(TAG, "Track added for $peerId")
            streams?.firstOrNull()?.let { stream ->
                val updatedStreams = _remoteStreams.value.toMutableMap()
                updatedStreams[peerId] = stream
                _remoteStreams.value = updatedStreams
                emitEvent(WebRTCEvent.RemoteStreamAdded(peerId, stream))
            }
        }
        
        override fun onConnectionChange(newState: PeerConnection.PeerConnectionState?) {
            Log.d(TAG, "Connection state changed for $peerId: $newState")
            newState?.let {
                emitEvent(WebRTCEvent.ConnectionStateChanged(peerId, it))
            }
        }
    }
    
    private fun emitEvent(event: WebRTCEvent) {
        scope.launch {
            _events.emit(event)
        }
    }
}
