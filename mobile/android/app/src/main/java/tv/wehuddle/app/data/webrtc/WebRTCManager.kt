package tv.wehuddle.app.data.webrtc

import android.content.Context
import android.media.AudioFormat
import android.util.Log
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.webrtc.*
import org.webrtc.audio.JavaAudioDeviceModule
import tv.wehuddle.app.data.model.WebRTCOffer
import tv.wehuddle.app.data.model.WebRTCAnswer
import tv.wehuddle.app.data.model.WebRTCIceCandidate
import tv.wehuddle.app.data.model.WebRTCMediaState
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import javax.inject.Inject

/**
 * WebRTC event types emitted by the WebRTC manager
 */
sealed class WebRTCEvent {
    data class LocalStreamReady(val stream: MediaStream) : WebRTCEvent()
    data class RemoteStreamAdded(val peerId: String, val stream: MediaStream) : WebRTCEvent()
    data class RemoteStreamRemoved(val peerId: String) : WebRTCEvent()
    data class IceCandidateGenerated(
        val peerId: String,
        val candidate: IceCandidate,
        val generation: String?,
    ) : WebRTCEvent()
    data class OfferCreated(
        val peerId: String,
        val sdp: SessionDescription,
        val generation: String,
    ) : WebRTCEvent()
    data class AnswerCreated(
        val peerId: String,
        val sdp: SessionDescription,
        val generation: String?,
    ) : WebRTCEvent()
    data class ConnectionStateChanged(val peerId: String, val state: PeerConnection.PeerConnectionState) : WebRTCEvent()
    data class LocalSpeakingChanged(val speaking: Boolean) : WebRTCEvent()
    data class Error(val message: String) : WebRTCEvent()
}

/**
 * Manages WebRTC peer connections for video/audio calls
 */
class WebRTCManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val iceConfigRepository: IceConfigRepository,
    private val communicationAudioRouter: CommunicationAudioRouter,
) {
    companion object {
        private const val TAG = "WebRTCManager"
        private const val INITIAL_CONNECTION_TIMEOUT_MILLIS = 15_000L
        private const val DISCONNECTED_RECOVERY_DELAY_MILLIS = 5_000L
        private const val ICE_REFRESH_RETRY_MILLIS = 60_000L

        /** Matches the web client's deterministic initial-offer rule. */
        fun shouldInitiatePeerConnection(localPeerId: String, remotePeerId: String): Boolean {
            return localPeerId.isNotBlank() &&
                remotePeerId.isNotBlank() &&
                localPeerId != remotePeerId &&
                localPeerId < remotePeerId
        }

        /** The non-initiating lexical side yields when simultaneous offers collide. */
        fun isPolitePeer(localPeerId: String, remotePeerId: String): Boolean {
            return localPeerId.isNotBlank() &&
                remotePeerId.isNotBlank() &&
                localPeerId != remotePeerId &&
                localPeerId > remotePeerId
        }

        /** Null remains accepted for interoperability with pre-generation clients. */
        fun isSignalingGenerationCompatible(
            hasActiveGeneration: Boolean,
            activeGeneration: String?,
            incomingGeneration: String?,
        ): Boolean {
            return incomingGeneration == null ||
                !hasActiveGeneration ||
                incomingGeneration == activeGeneration
        }

        fun createSignalingGeneration(): String = UUID.randomUUID().toString()

        /** Refresh while the credential still has 20% of its lifetime left. */
        internal fun iceCredentialRefreshDelayMillis(ttlSeconds: Long?): Long? {
            if (ttlSeconds == null || ttlSeconds <= 0L) return null
            return ttlSeconds.coerceAtMost(7 * 24 * 60 * 60L) * 800L
        }

        internal fun shouldCancelPeerRecovery(
            peerIsActive: Boolean,
            connectionIsCurrent: Boolean,
            connectionIsConnected: Boolean,
            force: Boolean,
        ): Boolean {
            return !peerIsActive ||
                !connectionIsCurrent ||
                (connectionIsConnected && !force)
        }

        internal fun shouldApplyPeerCallback(
            connectionExists: Boolean,
            connectionMatches: Boolean,
        ): Boolean = connectionExists && connectionMatches

        internal fun iceUfragsFromSdp(sdp: String): Set<String> = sdp
            .lineSequence()
            .map(String::trim)
            .filter { it.startsWith("a=ice-ufrag:") }
            .map { it.substringAfter("a=ice-ufrag:").trim() }
            .filter(String::isNotEmpty)
            .toSet()

        internal fun iceUfragFromCandidate(candidate: String): String? {
            val parts = candidate.trim().split(Regex("\\s+"))
            val marker = parts.indexOf("ufrag")
            if (marker < 0) return null
            return parts.getOrNull(marker + 1)?.takeIf(String::isNotBlank)
        }
    }
    
    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    
    private var peerConnectionFactory: PeerConnectionFactory? = null
    private val peerConnections = ConcurrentHashMap<String, PeerConnection>()
    private val peerLifecycleLock = Any()
    private data class SignalingGeneration(val value: String?)

    private val pendingIceCandidates = GenerationBuffer<IceCandidate>(maxPerPeer = 100)
    private val pendingLocalIceCandidates = GenerationBuffer<IceCandidate>(maxPerPeer = 100)
    private val signalingGenerations = ConcurrentHashMap<String, SignalingGeneration>()
    private val appliedRemoteGenerations = ConcurrentHashMap<String, SignalingGeneration>()
    private val announcedLocalGenerations = ConcurrentHashMap<String, SignalingGeneration>()
    private val localIceGenerations =
        ConcurrentHashMap<String, ConcurrentHashMap<String, SignalingGeneration>>()
    private val answerOperations = ConcurrentHashMap<String, String>()
    private val remoteAnswerOperations = ConcurrentHashMap<String, String>()
    private val initialOffersStarted = ConcurrentHashMap.newKeySet<String>()
    private val negotiationsInFlight = ConcurrentHashMap.newKeySet<String>()
    private val pendingRenegotiations = ConcurrentHashMap.newKeySet<String>()
    private val offerFailureAttempts = ConcurrentHashMap<String, Int>()
    private val activePeerIds = AtomicReference<Set<String>>(emptySet())
    private val recoveryAttempts = ConcurrentHashMap<String, Int>()
    private val recoveriesInFlight = ConcurrentHashMap.newKeySet<String>()
    private val forcedPeerRecoveries = ConcurrentHashMap.newKeySet<String>()
    private val connectionWatchdogs = ConcurrentHashMap<String, Job>()
    private var iceRefreshJob: Job? = null
    @Volatile
    private var localPeerId: String = ""
    @Volatile
    private var currentIceConfig: IceConfig = IceConfigRepository.fallbackConfig()
    @Volatile
    private var iceAccessContext: IceAccessContext? = null
    
    private var localAudioTrack: AudioTrack? = null
    private var localAudioSource: AudioSource? = null
    private var localVideoTrack: VideoTrack? = null
    private var localVideoSource: VideoSource? = null
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
    private val eventQueue = Channel<WebRTCEvent>(Channel.UNLIMITED)
    
    private val _localMediaState = MutableStateFlow(WebRTCMediaState())
    val localMediaState: StateFlow<WebRTCMediaState> = _localMediaState.asStateFlow()

    private val _localSpeaking = MutableStateFlow(false)
    val localSpeaking: StateFlow<Boolean> = _localSpeaking.asStateFlow()
    
    private val _remoteStreams =
        MutableStateFlow<Map<String, VersionedValue<MediaStream>>>(emptyMap())
    val remoteStreams: StateFlow<Map<String, VersionedValue<MediaStream>>> =
        _remoteStreams.asStateFlow()
    
    private var isInitialized = false
    private val audioRouteOwner = createSignalingGeneration()
    private var ownsCommunicationAudioRoute = false
    private val speakingDetector = SpeakingDetector()
    private val microphoneFailureInFlight = AtomicBoolean(false)
    private val cameraFailureInFlight = AtomicBoolean(false)
    private val audioPlayoutFailureReported = AtomicBoolean(false)

    /**
     * Atomically validates a native callback against the currently published
     * connection and applies its state mutation before replacement can begin.
     */
    private inline fun <T> withCurrentPeerConnection(
        peerId: String,
        expectedConnection: PeerConnection?,
        block: (PeerConnection) -> T,
    ): T? = synchronized(peerLifecycleLock) {
        val currentConnection = peerConnections[peerId]
        if (!shouldApplyPeerCallback(
                connectionExists = expectedConnection != null,
                connectionMatches = currentConnection === expectedConnection,
            )
        ) {
            return@synchronized null
        }
        block(currentConnection!!)
    }

    init {
        scope.launch {
            for (event in eventQueue) {
                _events.emit(event)
            }
        }
    }

    /** Refreshes the ICE configuration; the repository handles TTL caching. */
    suspend fun prepareIceServers(forceRefresh: Boolean = false): IceConfig {
        val access = iceAccessContext
        val config = iceConfigRepository.getIceConfig(access, forceRefresh)
        // A pre-join request can complete after the private membership token
        // arrives. Never let its STUN-only result overwrite authenticated TURN.
        if (iceAccessContext == access) {
            currentIceConfig = config
        }
        if (config.isFallback) {
            Log.w(TAG, "ICE API unavailable or invalid; continuing with STUN only")
        } else {
            Log.d(TAG, "Loaded ${config.servers.size} ICE server entries from API")
        }
        return config
    }

    /**
     * Installs the private room-membership proof used to mint TURN credentials.
     * The token arrives in a private Socket.IO snapshot, is never broadcast to
     * other room members, and is retained only until disconnect or teardown.
     */
    suspend fun updateIceAccess(roomId: String, socketId: String, token: String) {
        val next = IceAccessContext(
            roomId = roomId.trim(),
            socketId = socketId.trim(),
            token = token.trim(),
        )
        if (
            next.roomId.isEmpty() ||
            next.socketId.isEmpty() ||
            next.token.length !in 1..512 ||
            iceAccessContext == next
        ) {
            return
        }

        iceAccessContext = next
        iceRefreshJob?.cancel()
        iceRefreshJob = null
        refreshAuthorizedIceConfig(next, restartExistingPeers = true)
    }

    fun clearIceAccess() {
        iceRefreshJob?.cancel()
        iceRefreshJob = null
        iceAccessContext = null
        currentIceConfig = IceConfigRepository.fallbackConfig()
    }

    private suspend fun refreshAuthorizedIceConfig(
        access: IceAccessContext,
        restartExistingPeers: Boolean,
    ) {
        val previous = currentIceConfig
        val refreshed = iceConfigRepository.getIceConfig(access, forceRefresh = true)
        if (iceAccessContext != access) return

        if (refreshed.isFallback && previous.hasTurnRelay()) {
            // A transient refresh outage must not throw away credentials that
            // still have their final 20% lifetime available. Retry promptly.
            Log.w(TAG, "TURN refresh failed; retaining the current relay configuration")
            scheduleIceRefresh(access, ICE_REFRESH_RETRY_MILLIS)
            return
        }

        currentIceConfig = refreshed
        if (restartExistingPeers && refreshed.servers != previous.servers) {
            restartIceOnActivePeers()
        }

        val refreshDelay = iceCredentialRefreshDelayMillis(refreshed.ttlSeconds)
        if (refreshDelay != null && refreshed.hasTurnRelay()) {
            scheduleIceRefresh(access, refreshDelay)
        } else if (refreshed.isFallback) {
            scheduleIceRefresh(access, ICE_REFRESH_RETRY_MILLIS)
        }
    }

    private fun scheduleIceRefresh(access: IceAccessContext, delayMillis: Long) {
        iceRefreshJob?.cancel()
        val job = scope.launch {
            delay(delayMillis)
            if (iceAccessContext != access) return@launch
            iceRefreshJob = null
            refreshAuthorizedIceConfig(access, restartExistingPeers = true)
        }
        iceRefreshJob = job
    }

    private fun IceConfig.hasTurnRelay(): Boolean = servers.any { server ->
        server.urls.any { url -> url.startsWith("turn:") || url.startsWith("turns:") }
    }
    
    /**
     * Initialize the WebRTC factory. Must be called before any other operations.
     */
    @Synchronized
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
            
            val audioDeviceModule = JavaAudioDeviceModule.builder(context)
                .setAudioFormat(AudioFormat.ENCODING_PCM_16BIT)
                .setAudioRecordErrorCallback(object : JavaAudioDeviceModule.AudioRecordErrorCallback {
                    override fun onWebRtcAudioRecordInitError(error: String) {
                        reportMicrophoneFailure(error)
                    }

                    override fun onWebRtcAudioRecordStartError(
                        errorCode: JavaAudioDeviceModule.AudioRecordStartErrorCode,
                        error: String,
                    ) {
                        reportMicrophoneFailure("$errorCode: $error")
                    }

                    override fun onWebRtcAudioRecordError(error: String) {
                        reportMicrophoneFailure(error)
                    }
                })
                .setAudioTrackErrorCallback(object : JavaAudioDeviceModule.AudioTrackErrorCallback {
                    override fun onWebRtcAudioTrackInitError(error: String) {
                        reportAudioPlayoutFailure(error)
                    }

                    override fun onWebRtcAudioTrackStartError(
                        errorCode: JavaAudioDeviceModule.AudioTrackStartErrorCode,
                        error: String,
                    ) {
                        reportAudioPlayoutFailure("$errorCode: $error")
                    }

                    override fun onWebRtcAudioTrackError(error: String) {
                        reportAudioPlayoutFailure(error)
                    }
                })
                .setSamplesReadyCallback { samples ->
                    if (
                        samples.audioFormat == AudioFormat.ENCODING_PCM_16BIT &&
                        _localMediaState.value.mic
                    ) {
                        speakingDetector.updatePcm16(
                            samples.data,
                            android.os.SystemClock.elapsedRealtime(),
                        )?.let { speaking ->
                            // Capture may stop while the audio callback is in
                            // flight. Never resurrect a stale speaking=true.
                            if (_localMediaState.value.mic) {
                                emitLocalSpeaking(speaking)
                            } else {
                                speakingDetector.reset()
                            }
                        }
                    }
                }
                .createAudioDeviceModule()
            try {
                peerConnectionFactory = PeerConnectionFactory.builder()
                    .setAudioDeviceModule(audioDeviceModule)
                    .setVideoEncoderFactory(encoderFactory)
                    .setVideoDecoderFactory(decoderFactory)
                    .setOptions(PeerConnectionFactory.Options())
                    .createPeerConnectionFactory()
            } finally {
                // The factory retains its own native reference.
                audioDeviceModule.release()
            }

            isInitialized = true
            Log.d(TAG, "WebRTC initialized successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize WebRTC", e)
            runCatching { peerConnectionFactory?.dispose() }
            peerConnectionFactory = null
            runCatching { eglBase?.release() }
            eglBase = null
            _eglContext.value = null
            releaseCommunicationAudioRoute()
            isInitialized = false
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
    @Synchronized
    fun startCamera(localVideoSink: VideoSink? = null): Boolean {
        if (!isInitialized || peerConnectionFactory == null) {
            Log.e(TAG, "WebRTC not initialized")
            emitEvent(WebRTCEvent.Error("Camera calling is unavailable because WebRTC did not initialize"))
            return false
        }
        
        if (localVideoTrack != null) return true

        try {
            cameraFailureInFlight.set(false)
            // Create video capturer
            videoCapturer = createCameraCapturer()
            if (videoCapturer == null) {
                Log.e(TAG, "Failed to create camera capturer")
                emitEvent(WebRTCEvent.Error("No usable camera was found"))
                return false
            }
            
            // Create surface texture helper
            surfaceTextureHelper = SurfaceTextureHelper.create("CaptureThread", eglBase?.eglBaseContext)
            
            // Create video source
            val videoSource = peerConnectionFactory!!.createVideoSource(videoCapturer!!.isScreencast)
            localVideoSource = videoSource
            videoCapturer!!.initialize(surfaceTextureHelper, context, videoSource.capturerObserver)
            videoCapturer!!.startCapture(640, 480, 30)
            
            // Create video track
            localVideoTrack = peerConnectionFactory!!.createVideoTrack("video0", videoSource)
            localVideoTrack?.setEnabled(true)
            
            // Add sink for local preview
            localVideoSink?.let { localVideoTrack?.addSink(it) }
            
            rebuildLocalStream()
            _localMediaState.value = _localMediaState.value.copy(cam = true)
            addTrackToExistingPeers(localVideoTrack)
            Log.d(TAG, "Camera started successfully")
            return true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start camera", e)
            val failedTrack = localVideoTrack
            removeTrackFromExistingPeers(failedTrack)
            localVideoTrack = null
            rebuildLocalStream()
            runCatching { videoCapturer?.stopCapture() }
            failedTrack?.dispose()
            localVideoSource?.dispose()
            localVideoSource = null
            videoCapturer?.dispose()
            videoCapturer = null
            surfaceTextureHelper?.dispose()
            surfaceTextureHelper = null
            _localMediaState.value = _localMediaState.value.copy(cam = false)
            emitEvent(WebRTCEvent.Error("Failed to start camera: ${e.message}"))
            return false
        }
    }
    
    /**
     * Stop the camera
     */
    @Synchronized
    fun stopCamera() {
        val track = localVideoTrack
        removeTrackFromExistingPeers(track)
        localVideoTrack = null
        rebuildLocalStream()

        runCatching { videoCapturer?.stopCapture() }
            .onFailure { Log.w(TAG, "Camera capture did not stop cleanly", it) }
        runCatching { videoCapturer?.dispose() }
        videoCapturer = null

        runCatching { track?.dispose() }
        runCatching { localVideoSource?.dispose() }
        localVideoSource = null

        runCatching { surfaceTextureHelper?.dispose() }
        surfaceTextureHelper = null

        _localMediaState.value = _localMediaState.value.copy(cam = false)
        Log.d(TAG, "Camera stopped")
    }
    
    /**
     * Start microphone capture
     */
    @Synchronized
    fun startMicrophone(): Boolean {
        if (!isInitialized || peerConnectionFactory == null) {
            Log.e(TAG, "WebRTC not initialized")
            emitEvent(WebRTCEvent.Error("Voice calling is unavailable because WebRTC did not initialize"))
            return false
        }
        
        if (localAudioTrack != null) return true

        try {
            microphoneFailureInFlight.set(false)
            acquireCommunicationAudioRoute()
            val audioConstraints = MediaConstraints().apply {
                mandatory.add(MediaConstraints.KeyValuePair("googEchoCancellation", "true"))
                mandatory.add(MediaConstraints.KeyValuePair("googNoiseSuppression", "true"))
                mandatory.add(MediaConstraints.KeyValuePair("googAutoGainControl", "true"))
            }
            
            val audioSource = peerConnectionFactory!!.createAudioSource(audioConstraints)
            localAudioSource = audioSource
            localAudioTrack = peerConnectionFactory!!.createAudioTrack("audio0", audioSource)
            localAudioTrack?.setEnabled(true)
            
            rebuildLocalStream()
            _localMediaState.value = _localMediaState.value.copy(mic = true)
            addTrackToExistingPeers(localAudioTrack)
            Log.d(TAG, "Microphone started successfully")
            return true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start microphone", e)
            val failedTrack = localAudioTrack
            removeTrackFromExistingPeers(failedTrack)
            localAudioTrack = null
            rebuildLocalStream()
            failedTrack?.dispose()
            localAudioSource?.dispose()
            localAudioSource = null
            _localMediaState.value = _localMediaState.value.copy(mic = false)
            updateCommunicationAudioOwnership()
            emitEvent(WebRTCEvent.Error("Failed to start microphone: ${e.message}"))
            return false
        }
    }
    
    /**
     * Stop microphone
     */
    @Synchronized
    fun stopMicrophone() {
        val track = localAudioTrack
        removeTrackFromExistingPeers(track)
        localAudioTrack = null
        rebuildLocalStream()

        // Gate an in-flight audio callback before native disposal begins.
        _localMediaState.value = _localMediaState.value.copy(mic = false)
        speakingDetector.reset()?.let(::emitLocalSpeaking)

        runCatching { track?.setEnabled(false) }
        runCatching { track?.dispose() }
        runCatching { localAudioSource?.dispose() }
        localAudioSource = null

        updateCommunicationAudioOwnership()
        Log.d(TAG, "Microphone stopped")
    }
    
    /**
     * Toggle microphone mute state
     */
    @Synchronized
    fun toggleMicrophone(): Boolean {
        return if (_localMediaState.value.mic) {
            stopMicrophone()
            false
        } else {
            startMicrophone()
        }
    }

    private fun rebuildLocalStream() {
        // MediaStream.dispose() also disposes every attached track. Detach the
        // reusable tracks first, then dispose only the empty stream wrapper.
        localMediaStream?.let { previous ->
            previous.audioTracks.toList().forEach(previous::removeTrack)
            previous.videoTracks.toList().forEach(previous::removeTrack)
            previous.dispose()
        }

        if (localAudioTrack == null && localVideoTrack == null) {
            localMediaStream = null
            _localStream.value = null
            return
        }

        val stream = peerConnectionFactory?.createLocalMediaStream("local-stream")
            ?: error("Could not create the local media stream")
        localAudioTrack?.let { check(stream.addTrack(it)) }
        localVideoTrack?.let { check(stream.addTrack(it)) }
        localMediaStream = stream
        _localStream.value = stream
        emitEvent(WebRTCEvent.LocalStreamReady(stream))
    }

    @Synchronized
    private fun addTrackToExistingPeers(track: MediaStreamTrack?) {
        if (track == null) return
        peerConnections.forEach { (peerId, peerConnection) ->
            val alreadySent = peerConnection.senders.any { sender ->
                sender.track()?.kind() == track.kind()
            }
            if (!alreadySent) {
                peerConnection.addTrack(track, listOf("local-stream"))
                requestRenegotiation(peerId)
            }
        }
    }

    @Synchronized
    private fun removeTrackFromExistingPeers(track: MediaStreamTrack?) {
        if (track == null) return
        peerConnections.forEach { (peerId, peerConnection) ->
            val matchingSenders = peerConnection.senders.filter { sender ->
                sender.track()?.id() == track.id()
            }
            if (matchingSenders.isNotEmpty()) {
                matchingSenders.forEach(peerConnection::removeTrack)
                requestRenegotiation(peerId)
            }
        }
    }

    private fun emitLocalSpeaking(speaking: Boolean) {
        _localSpeaking.value = speaking
        emitEvent(WebRTCEvent.LocalSpeakingChanged(speaking))
    }

    private fun reportMicrophoneFailure(detail: String) {
        Log.e(TAG, "Microphone capture failed: $detail")
        if (!microphoneFailureInFlight.compareAndSet(false, true)) return
        scope.launch {
            if (localAudioTrack != null) stopMicrophone()
            emitEvent(WebRTCEvent.Error("Microphone capture stopped: $detail"))
            microphoneFailureInFlight.set(false)
        }
    }

    private fun reportAudioPlayoutFailure(detail: String) {
        Log.e(TAG, "Call audio output failed: $detail")
        if (audioPlayoutFailureReported.compareAndSet(false, true)) {
            emitEvent(WebRTCEvent.Error("Call audio output failed: $detail"))
        }
    }

    private fun reportCameraFailure(detail: String) {
        Log.e(TAG, "Camera capture failed: $detail")
        if (!cameraFailureInFlight.compareAndSet(false, true)) return
        scope.launch {
            if (localVideoTrack != null) stopCamera()
            emitEvent(WebRTCEvent.Error("Camera capture stopped: $detail"))
            cameraFailureInFlight.set(false)
        }
    }
    
    /**
     * Toggle camera state
     */
    @Synchronized
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
    @Synchronized
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
    @Synchronized
    private fun getOrCreatePeerConnection(peerId: String): PeerConnection? {
        synchronized(peerLifecycleLock) {
            peerConnections[peerId]?.let { return it }

            val factory = peerConnectionFactory
            if (!isInitialized || factory == null) {
                Log.e(TAG, "WebRTC not initialized")
                emitEvent(WebRTCEvent.Error("Calling is unavailable because WebRTC did not initialize"))
                return null
            }

            val rtcConfig = createRtcConfiguration()
            val connectionRef = AtomicReference<PeerConnection?>()
            val peerConnection = factory.createPeerConnection(
                rtcConfig,
                createPeerConnectionObserver(peerId, connectionRef),
            )

            if (peerConnection == null) {
                Log.e(TAG, "Failed to create peer connection for $peerId")
                return null
            }
            connectionRef.set(peerConnection)

            try {
                localAudioTrack?.let { track ->
                    peerConnection.addTrack(track, listOf("local-stream"))
                }
                localVideoTrack?.let { track ->
                    peerConnection.addTrack(track, listOf("local-stream"))
                }
            } catch (error: Exception) {
                Log.e(TAG, "Failed to attach local tracks for $peerId", error)
                peerConnection.close()
                peerConnection.dispose()
                return null
            }

            peerConnections[peerId] = peerConnection
            // ICE can arrive before the offer while REST ICE configuration is
            // still loading. Never replace that early buffer when the PC appears.
            pendingIceCandidates.ensurePeer(peerId)
            pendingLocalIceCandidates.ensurePeer(peerId)
            scheduleConnectionWatchdog(peerId, peerConnection)

            Log.d(TAG, "Created peer connection for $peerId")
            return peerConnection
        }
    }

    private fun createRtcConfiguration(): PeerConnection.RTCConfiguration {
        val iceServers = currentIceConfig.servers.flatMap { server ->
            server.urls.map { url ->
                PeerConnection.IceServer.builder(url).apply {
                    server.username?.let(::setUsername)
                    server.credential?.let(::setPassword)
                }.createIceServer()
            }
        }
        return PeerConnection.RTCConfiguration(iceServers).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
            // Perfect-negotiation's polite peer requires libwebrtc to roll a
            // pending local offer back before applying a collision.
            enableImplicitRollback = true
        }
    }

    /** Rotate TURN credentials without dropping established media streams. */
    private fun restartIceOnActivePeers() {
        activePeerIds.get().forEach { peerId ->
            val peerConnection = peerConnections[peerId] ?: return@forEach
            val updated = runCatching {
                peerConnection.setConfiguration(createRtcConfiguration())
            }.onFailure { error ->
                Log.w(TAG, "Could not update ICE servers for $peerId", error)
            }.getOrDefault(false)

            if (updated) {
                runCatching { peerConnection.restartIce() }
                    .onSuccess { requestRenegotiation(peerId) }
                    .onFailure { error ->
                        Log.w(TAG, "Could not restart ICE for $peerId; rebuilding", error)
                        rebuildPeerWithCurrentIce(peerId, peerConnection)
                    }
            } else {
                rebuildPeerWithCurrentIce(peerId, peerConnection)
            }
        }
    }

    private fun rebuildPeerWithCurrentIce(
        peerId: String,
        expectedConnection: PeerConnection,
    ) {
        rebuildPeerConnectionIfCurrent(peerId, expectedConnection)
    }

    @Synchronized
    private fun rebuildPeerConnectionIfCurrent(
        peerId: String,
        expectedConnection: PeerConnection,
        recoveryAttempt: Int? = null,
    ): Boolean {
        if (peerId !in activePeerIds.get()) return false
        if (!closePeerConnection(peerId, expectedConnection)) return false
        if (peerId !in activePeerIds.get()) return false
        if (getOrCreatePeerConnection(peerId) == null) return false
        recoveryAttempt?.let { recoveryAttempts[peerId] = it }
        initialOffersStarted.add(peerId)
        createOffer(peerId)
        return true
    }

    /**
     * Keeps the native peer map aligned with authoritative room presence.
     * Exactly one side creates the initial offer, using the same lexical rule
     * as the web client, so Android↔web works in either socket-id ordering.
     */
    suspend fun reconcilePeers(localPeerId: String, activePeerIds: Collection<String>) {
        prepareIceServers()
        this.localPeerId = localPeerId

        val active = activePeerIds
            .filter { it.isNotBlank() && it != localPeerId }
            .toSet()

        this.activePeerIds.set(active)

        // An ICE event can precede peer creation. Presence, rather than the PC
        // map alone, is therefore authoritative for pruning early buffers.
        pendingIceCandidates.retainPeers(active)
        pendingLocalIceCandidates.retainPeers(active)
        localIceGenerations.keys.removeIf { it !in active }

        peerConnections.keys.toList()
            .filterNot(active::contains)
            .forEach(::closePeerConnection)

        active.forEach { peerId ->
            getOrCreatePeerConnection(peerId)
            if (
                shouldInitiatePeerConnection(localPeerId, peerId) &&
                initialOffersStarted.add(peerId)
            ) {
                createOffer(peerId)
            }
        }
    }
    
    /**
     * Create an offer for a peer
     */
    private fun createOffer(peerId: String) {
        val peerConnection = getOrCreatePeerConnection(peerId)
        if (peerConnection == null) {
            handleOfferFailure(peerId, "peer connection could not be created")
            return
        }

        if (peerConnection.signalingState() != PeerConnection.SignalingState.STABLE) {
            pendingRenegotiations.add(peerId)
            return
        }
        if (!negotiationsInFlight.add(peerId)) {
            pendingRenegotiations.add(peerId)
            return
        }

        val generation = createSignalingGeneration()
        
        val constraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", "true"))
        }
        
        peerConnection.createOffer(object : SdpObserver {
            override fun onCreateSuccess(sdp: SessionDescription) {
                if (peerConnections[peerId] !== peerConnection) return
                if (
                    peerId !in negotiationsInFlight ||
                    peerConnection.signalingState() != PeerConnection.SignalingState.STABLE
                ) {
                    negotiationsInFlight.remove(peerId)
                    pendingRenegotiations.add(peerId)
                    return
                }
                val hadPreviousGeneration = signalingGenerations.containsKey(peerId)
                val previousGeneration = signalingGenerations[peerId]?.value
                signalingGenerations[peerId] = SignalingGeneration(generation)
                peerConnection.setLocalDescription(object : SdpObserver {
                    override fun onCreateSuccess(p0: SessionDescription?) {}
                    override fun onSetSuccess() {
                        if (
                            peerConnections[peerId] !== peerConnection ||
                            signalingGenerations[peerId]?.value != generation
                        ) {
                            // A polite-side incoming offer superseded this
                            // local offer, or recovery replaced this PC, while
                            // setLocalDescription was queued.
                            return
                        }
                        negotiationsInFlight.remove(peerId)
                        offerFailureAttempts.remove(peerId)
                        Log.d(TAG, "Local description set for $peerId")
                        emitEvent(WebRTCEvent.OfferCreated(peerId, sdp, generation))
                        announceLocalDescription(peerId, sdp, generation)
                    }
                    override fun onCreateFailure(error: String?) {}
                    override fun onSetFailure(error: String?) {
                        if (
                            peerConnections[peerId] !== peerConnection ||
                            signalingGenerations[peerId]?.value != generation
                        ) {
                            return
                        }
                        restoreGenerationAfterFailure(
                            peerId,
                            generation,
                            hadPreviousGeneration,
                            previousGeneration,
                        )
                        Log.e(TAG, "Failed to set local description: $error")
                        handleOfferFailure(peerId, "set local offer: ${error ?: "unknown error"}")
                    }
                }, sdp)
            }
            override fun onSetSuccess() {}
            override fun onCreateFailure(error: String?) {
                if (peerConnections[peerId] !== peerConnection) return
                Log.e(TAG, "Failed to create offer: $error")
                handleOfferFailure(peerId, "create offer: ${error ?: "unknown error"}")
            }
            override fun onSetFailure(error: String?) {}
        }, constraints)
    }

    private fun handleOfferFailure(peerId: String, detail: String) {
        negotiationsInFlight.remove(peerId)
        val attempt = (offerFailureAttempts[peerId] ?: 0) + 1
        offerFailureAttempts[peerId] = attempt
        if (attempt > 3 || peerId !in activePeerIds.get()) {
            emitEvent(WebRTCEvent.Error("Could not negotiate the call with $peerId ($detail)"))
            return
        }

        val failedConnection = peerConnections[peerId]
        scope.launch {
            delay(250L * attempt)
            if (peerId !in activePeerIds.get() || peerConnections[peerId] !== failedConnection) {
                return@launch
            }
            requestRenegotiation(peerId)
        }
    }

    private fun requestRenegotiation(peerId: String) {
        val peerConnection = peerConnections[peerId] ?: return
        if (
            peerConnection.signalingState() == PeerConnection.SignalingState.STABLE &&
            !negotiationsInFlight.contains(peerId)
        ) {
            createOffer(peerId)
        } else {
            pendingRenegotiations.add(peerId)
        }
    }

    private fun drainPendingRenegotiation(peerId: String) {
        if (pendingRenegotiations.remove(peerId)) {
            requestRenegotiation(peerId)
        }
    }
    
    /**
     * Handle an incoming offer
     */
    suspend fun handleOffer(peerId: String, offer: WebRTCOffer) {
        prepareIceServers()
        activePeerIds.updateAndGet { active -> active + peerId }
        initialOffersStarted.add(peerId)
        val peerConnection = getOrCreatePeerConnection(peerId) ?: return
        val offerCollision =
            peerId in negotiationsInFlight ||
                peerConnection.signalingState() != PeerConnection.SignalingState.STABLE
        if (offerCollision && !isPolitePeer(localPeerId, peerId)) {
            // Keep our active generation. ICE for the ignored offer carries a
            // different generation and is dropped by the same correlation gate.
            Log.d(TAG, "Ignoring colliding offer from $peerId on the impolite side")
            return
        }
        if (offerCollision) {
            // Modern libwebrtc performs the polite rollback when the remote
            // offer is applied. Preserve our local media-change intent and
            // renegotiate after the answer has been emitted.
            negotiationsInFlight.remove(peerId)
            pendingRenegotiations.add(peerId)
        }
        val hadPreviousGeneration = signalingGenerations.containsKey(peerId)
        val previousGeneration = signalingGenerations[peerId]?.value
        signalingGenerations[peerId] = SignalingGeneration(offer.generation)
        val answerOperation = createSignalingGeneration()
        answerOperations[peerId] = answerOperation
        // Until this exact description has been applied, no ICE generation is
        // safe to add (remoteDescription may still refer to the prior offer).
        appliedRemoteGenerations.remove(peerId)
        
        val sdp = SessionDescription(SessionDescription.Type.OFFER, offer.sdp)
        
        peerConnection.setRemoteDescription(object : SdpObserver {
            override fun onCreateSuccess(p0: SessionDescription?) {}
            override fun onSetSuccess() {
                if (
                    peerConnections[peerId] !== peerConnection ||
                    answerOperations[peerId] != answerOperation ||
                    signalingGenerations[peerId]?.value != offer.generation
                ) {
                    return
                }
                Log.d(TAG, "Remote description set for $peerId")
                appliedRemoteGenerations[peerId] = SignalingGeneration(offer.generation)
                flushPendingIceCandidates(peerId, peerConnection)
                createAnswer(
                    peerId = peerId,
                    peerConnection = peerConnection,
                    operation = answerOperation,
                    generation = offer.generation,
                )
            }
            override fun onCreateFailure(error: String?) {}
            override fun onSetFailure(error: String?) {
                if (
                    peerConnections[peerId] !== peerConnection ||
                    answerOperations[peerId] != answerOperation
                ) {
                    return
                }
                answerOperations.remove(peerId, answerOperation)
                restoreGenerationAfterFailure(
                    peerId,
                    offer.generation,
                    hadPreviousGeneration,
                    previousGeneration,
                )
                Log.e(TAG, "Failed to set remote description: $error")
                emitEvent(WebRTCEvent.Error("Failed to accept call offer: $error"))
                schedulePeerRecovery(peerId, force = true)
            }
        }, sdp)
    }
    
    /**
     * Create an answer for a peer
     */
    private fun createAnswer(
        peerId: String,
        peerConnection: PeerConnection,
        operation: String,
        generation: String?,
    ) {
        val constraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", "true"))
        }
        
        peerConnection.createAnswer(object : SdpObserver {
            override fun onCreateSuccess(sdp: SessionDescription) {
                if (
                    peerConnections[peerId] !== peerConnection ||
                    answerOperations[peerId] != operation ||
                    signalingGenerations[peerId]?.value != generation ||
                    peerConnection.signalingState() != PeerConnection.SignalingState.HAVE_REMOTE_OFFER
                ) {
                    return
                }
                peerConnection.setLocalDescription(object : SdpObserver {
                    override fun onCreateSuccess(p0: SessionDescription?) {}
                    override fun onSetSuccess() {
                        if (
                            peerConnections[peerId] !== peerConnection ||
                            answerOperations[peerId] != operation ||
                            signalingGenerations[peerId]?.value != generation
                        ) {
                            return
                        }
                        answerOperations.remove(peerId, operation)
                        Log.d(TAG, "Local answer set for $peerId")
                        emitEvent(
                            WebRTCEvent.AnswerCreated(
                                peerId,
                                sdp,
                                generation,
                            )
                        )
                        announceLocalDescription(peerId, sdp, generation)
                        drainPendingRenegotiation(peerId)
                    }
                    override fun onCreateFailure(error: String?) {}
                    override fun onSetFailure(error: String?) {
                        if (
                            peerConnections[peerId] !== peerConnection ||
                            answerOperations[peerId] != operation
                        ) {
                            return
                        }
                        answerOperations.remove(peerId, operation)
                        Log.e(TAG, "Failed to set local answer: $error")
                        emitEvent(WebRTCEvent.Error("Failed to answer call: $error"))
                        schedulePeerRecovery(peerId, force = true)
                    }
                }, sdp)
            }
            override fun onSetSuccess() {}
            override fun onCreateFailure(error: String?) {
                if (
                    peerConnections[peerId] !== peerConnection ||
                    answerOperations[peerId] != operation
                ) {
                    return
                }
                answerOperations.remove(peerId, operation)
                Log.e(TAG, "Failed to create answer: $error")
                emitEvent(WebRTCEvent.Error("Failed to create call answer: $error"))
                schedulePeerRecovery(peerId, force = true)
            }
            override fun onSetFailure(error: String?) {}
        }, constraints)
    }
    
    /**
     * Handle an incoming answer
     */
    fun handleAnswer(peerId: String, answer: WebRTCAnswer) {
        val peerConnection = peerConnections[peerId] ?: return
        if (!isIncomingGenerationCompatible(peerId, answer.generation)) {
            Log.w(TAG, "Ignoring stale WebRTC answer for $peerId")
            return
        }
        if (peerConnection.signalingState() != PeerConnection.SignalingState.HAVE_LOCAL_OFFER) {
            Log.w(TAG, "Ignoring WebRTC answer without an active local offer for $peerId")
            return
        }
        val expectedGeneration = signalingGenerations[peerId]?.value
        val answerOperation = createSignalingGeneration()
        if (remoteAnswerOperations.putIfAbsent(peerId, answerOperation) != null) {
            Log.w(TAG, "Ignoring duplicate WebRTC answer while one is being applied for $peerId")
            return
        }
        appliedRemoteGenerations.remove(peerId)
        
        val sdp = SessionDescription(SessionDescription.Type.ANSWER, answer.sdp)
        
        peerConnection.setRemoteDescription(object : SdpObserver {
            override fun onCreateSuccess(p0: SessionDescription?) {}
            override fun onSetSuccess() {
                if (
                    peerConnections[peerId] !== peerConnection ||
                    remoteAnswerOperations[peerId] != answerOperation ||
                    signalingGenerations[peerId]?.value != expectedGeneration
                ) {
                    return
                }
                remoteAnswerOperations.remove(peerId, answerOperation)
                Log.d(TAG, "Remote answer set for $peerId")
                appliedRemoteGenerations[peerId] = SignalingGeneration(expectedGeneration)
                flushPendingIceCandidates(peerId, peerConnection)
                drainPendingRenegotiation(peerId)
            }
            override fun onCreateFailure(error: String?) {}
            override fun onSetFailure(error: String?) {
                if (
                    peerConnections[peerId] !== peerConnection ||
                    remoteAnswerOperations[peerId] != answerOperation ||
                    signalingGenerations[peerId]?.value != expectedGeneration
                ) {
                    return
                }
                remoteAnswerOperations.remove(peerId, answerOperation)
                Log.e(TAG, "Failed to set remote answer: $error")
                emitEvent(WebRTCEvent.Error("Failed to complete call setup: $error"))
                schedulePeerRecovery(peerId, force = true)
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

        if (!pendingIceCandidates.add(peerId, iceCandidate, candidate.generation)) {
            Log.w(TAG, "Evicted the oldest pending ICE candidate for $peerId")
        }
        // Always enqueue before checking readiness. If setRemoteDescription's
        // callback drains concurrently, the second flush below closes the
        // otherwise permanent enqueue-after-drain race.
        val peerConnection = peerConnections[peerId]
        if (peerConnection != null && canApplyRemoteIce(peerId, candidate.generation)) {
            flushPendingIceCandidates(peerId, peerConnection)
        }
    }

    private fun flushPendingIceCandidates(peerId: String, peerConnection: PeerConnection) {
        if (peerConnections[peerId] !== peerConnection) return
        val applied = appliedRemoteGenerations[peerId] ?: return
        pendingIceCandidates
            .drain(peerId) { generation ->
                isSignalingGenerationCompatible(
                    hasActiveGeneration = true,
                    activeGeneration = applied.value,
                    incomingGeneration = generation,
                )
            }
            .forEach { applyIceCandidate(peerId, peerConnection, it) }
    }

    private fun canApplyRemoteIce(peerId: String, generation: String?): Boolean {
        val applied = appliedRemoteGenerations[peerId] ?: return false
        return isSignalingGenerationCompatible(
            hasActiveGeneration = true,
            activeGeneration = applied.value,
            incomingGeneration = generation,
        )
    }

    private fun applyIceCandidate(
        peerId: String,
        peerConnection: PeerConnection,
        candidate: IceCandidate,
    ) {
        if (peerConnections[peerId] !== peerConnection) return
        if (!peerConnection.addIceCandidate(candidate)) {
            Log.w(TAG, "libwebrtc rejected an ICE candidate for $peerId")
        }
    }

    /** Marks the SDP event as queued before releasing any ICE it generated. */
    private fun announceLocalDescription(
        peerId: String,
        description: SessionDescription,
        generation: String?,
    ) {
        val ufragGenerations = ConcurrentHashMap<String, SignalingGeneration>()
        iceUfragsFromSdp(description.description).forEach { ufrag ->
            ufragGenerations[ufrag] = SignalingGeneration(generation)
        }
        localIceGenerations[peerId] = ufragGenerations
        announcedLocalGenerations[peerId] = SignalingGeneration(generation)

        pendingLocalIceCandidates
            .drain(peerId) { ufrag ->
                ufrag == null || ufragGenerations[ufrag]?.value == generation
            }
            .forEach { candidate ->
                emitEvent(WebRTCEvent.IceCandidateGenerated(peerId, candidate, generation))
            }
    }

    private fun handleLocalIceCandidate(
        peerId: String,
        peerConnection: PeerConnection?,
        candidate: IceCandidate,
    ) {
        withCurrentPeerConnection(peerId, peerConnection) {
            val ufrag = iceUfragFromCandidate(candidate.sdp)
            val announced = announcedLocalGenerations[peerId]
            val resolved = ufrag?.let { localIceGenerations[peerId]?.get(it) }
            val generationChanging = signalingGenerations[peerId]?.value != announced?.value
            val canEmit = announced != null && when {
                ufrag != null -> resolved?.value == announced.value
                else -> !generationChanging
            }

            if (canEmit) {
                emitEvent(
                    WebRTCEvent.IceCandidateGenerated(
                        peerId = peerId,
                        candidate = candidate,
                        generation = resolved?.value ?: announced.value,
                    )
                )
            } else if (!pendingLocalIceCandidates.add(peerId, candidate, ufrag)) {
                Log.w(TAG, "Evicted the oldest pending local ICE candidate for $peerId")
            }
        }
    }

    private fun isIncomingGenerationCompatible(peerId: String, generation: String?): Boolean {
        return isSignalingGenerationCompatible(
            hasActiveGeneration = signalingGenerations.containsKey(peerId),
            activeGeneration = signalingGenerations[peerId]?.value,
            incomingGeneration = generation,
        )
    }

    private fun restoreGenerationAfterFailure(
        peerId: String,
        failedGeneration: String?,
        hadPreviousGeneration: Boolean,
        previousGeneration: String?,
    ) {
        if (!signalingGenerations.containsKey(peerId)) return
        if (signalingGenerations[peerId]?.value != failedGeneration) return
        if (hadPreviousGeneration) {
            signalingGenerations[peerId] = SignalingGeneration(previousGeneration)
        } else {
            signalingGenerations.remove(peerId)
        }
    }
    
    /**
     * Close a specific peer connection
     */
    @Synchronized
    fun closePeerConnection(peerId: String) {
        closePeerConnection(peerId, expectedConnection = null)
    }

    @Synchronized
    private fun closePeerConnection(
        peerId: String,
        expectedConnection: PeerConnection?,
    ): Boolean {
        val hadPeerConnection = synchronized(peerLifecycleLock) {
            val currentConnection = peerConnections[peerId]
            if (
                currentConnection == null ||
                (expectedConnection != null && currentConnection !== expectedConnection)
            ) {
                return@synchronized false
            }

            connectionWatchdogs.remove(peerId)?.cancel()
            val removed = peerConnections.remove(peerId, currentConnection)
            pendingIceCandidates.remove(peerId)
            pendingLocalIceCandidates.remove(peerId)
            signalingGenerations.remove(peerId)
            appliedRemoteGenerations.remove(peerId)
            announcedLocalGenerations.remove(peerId)
            localIceGenerations.remove(peerId)
            answerOperations.remove(peerId)
            remoteAnswerOperations.remove(peerId)
            initialOffersStarted.remove(peerId)
            negotiationsInFlight.remove(peerId)
            pendingRenegotiations.remove(peerId)
            offerFailureAttempts.remove(peerId)
            recoveryAttempts.remove(peerId)
            forcedPeerRecoveries.remove(peerId)
            if (removed) {
                currentConnection.close()
                currentConnection.dispose()
            }
            // Keep removal inside the lifecycle lock: a replacement peer must
            // not publish its stream before teardown removes the old one.
            _remoteStreams.update { current -> current - peerId }
            removed
        }
        updateCommunicationAudioOwnership()
        
        if (hadPeerConnection) {
            emitEvent(WebRTCEvent.RemoteStreamRemoved(peerId))
        }
        Log.d(TAG, "Closed peer connection for $peerId")
        return hadPeerConnection
    }
    
    /**
     * Close all peer connections
     */
    @Synchronized
    fun closeAllPeerConnections() {
        activePeerIds.set(emptySet())
        peerConnections.keys.toList().forEach { peerId ->
            closePeerConnection(peerId)
        }
        pendingIceCandidates.clear()
        pendingLocalIceCandidates.clear()
        signalingGenerations.clear()
        appliedRemoteGenerations.clear()
        announcedLocalGenerations.clear()
        localIceGenerations.clear()
        answerOperations.clear()
        remoteAnswerOperations.clear()
        initialOffersStarted.clear()
        negotiationsInFlight.clear()
        pendingRenegotiations.clear()
        offerFailureAttempts.clear()
        recoveryAttempts.clear()
        forcedPeerRecoveries.clear()
    }
    
    /**
     * Release all resources
     */
    @Synchronized
    fun release() {
        clearIceAccess()
        // Close peers before removing local tracks so teardown cannot start a
        // final renegotiation that races the socket leave/disconnect.
        closeAllPeerConnections()
        stopCamera()
        stopMicrophone()
        
        // stopCamera/stopMicrophone detach tracks before disposing them, so an
        // empty stream is all that can remain here.
        localMediaStream?.dispose()
        localMediaStream = null
        _localStream.value = null
        
        peerConnectionFactory?.dispose()
        peerConnectionFactory = null
        releaseCommunicationAudioRoute()
        
        eglBase?.release()
        eglBase = null
        _eglContext.value = null
        
        isInitialized = false
        eventQueue.close()
        scope.cancel()
        Log.d(TAG, "WebRTC resources released")
    }

    @Synchronized
    private fun acquireCommunicationAudioRoute() {
        if (ownsCommunicationAudioRoute) return
        communicationAudioRouter.acquire(audioRouteOwner)
        ownsCommunicationAudioRoute = true
    }

    @Synchronized
    private fun releaseCommunicationAudioRoute() {
        if (!ownsCommunicationAudioRoute) return
        communicationAudioRouter.release(audioRouteOwner)
        ownsCommunicationAudioRoute = false
        audioPlayoutFailureReported.set(false)
    }

    @Synchronized
    private fun updateCommunicationAudioOwnership() {
        val needsCommunicationAudio = localAudioTrack != null ||
            _remoteStreams.value.values.any { snapshot ->
                snapshot.value.audioTracks.isNotEmpty()
            }
        if (needsCommunicationAudio) {
            acquireCommunicationAudioRoute()
        } else {
            releaseCommunicationAudioRoute()
        }
    }
    
    private fun createCameraCapturer(): CameraVideoCapturer? {
        val enumerator = Camera2Enumerator(context)
        val eventsHandler = object : CameraVideoCapturer.CameraEventsHandler {
            override fun onCameraError(error: String) = reportCameraFailure(error)
            override fun onCameraDisconnected() = reportCameraFailure("Camera disconnected")
            override fun onCameraFreezed(error: String) = reportCameraFailure(error)
            override fun onCameraOpening(cameraName: String) = Unit
            override fun onFirstFrameAvailable() = Unit
            override fun onCameraClosed() = Unit
        }
        
        // Try front camera first
        for (deviceName in enumerator.deviceNames) {
            if (enumerator.isFrontFacing(deviceName)) {
                val capturer = enumerator.createCapturer(deviceName, eventsHandler)
                if (capturer != null) return capturer
            }
        }
        
        // Fall back to back camera
        for (deviceName in enumerator.deviceNames) {
            if (!enumerator.isFrontFacing(deviceName)) {
                val capturer = enumerator.createCapturer(deviceName, eventsHandler)
                if (capturer != null) return capturer
            }
        }
        
        return null
    }
    
    private fun createPeerConnectionObserver(
        peerId: String,
        connectionRef: AtomicReference<PeerConnection?>,
    ) = object : PeerConnection.Observer {
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
                handleLocalIceCandidate(peerId, connectionRef.get(), it)
            }
        }
        
        override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) {
            Log.d(TAG, "ICE candidates removed for $peerId")
        }
        
        override fun onAddStream(stream: MediaStream?) {
            val expectedConnection = connectionRef.get()
            val applied = withCurrentPeerConnection(peerId, expectedConnection) {
                Log.d(TAG, "Stream added for $peerId")
                stream?.let {
                    it.audioTracks.forEach { track -> track.setEnabled(true) }
                    _remoteStreams.update { current ->
                        publishVersionedValue(current, peerId, it)
                    }
                    emitEvent(WebRTCEvent.RemoteStreamAdded(peerId, it))
                }
                true
            } == true
            if (applied) updateCommunicationAudioOwnership()
        }
        
        override fun onRemoveStream(stream: MediaStream?) {
            val expectedConnection = connectionRef.get()
            val applied = withCurrentPeerConnection(peerId, expectedConnection) {
                Log.d(TAG, "Stream removed for $peerId")
                _remoteStreams.update { current -> current - peerId }
                emitEvent(WebRTCEvent.RemoteStreamRemoved(peerId))
                true
            } == true
            if (applied) updateCommunicationAudioOwnership()
        }
        
        override fun onDataChannel(channel: DataChannel?) {
            Log.d(TAG, "Data channel for $peerId: ${channel?.label()}")
        }
        
        override fun onRenegotiationNeeded() {
            Log.d(TAG, "Renegotiation needed for $peerId")
        }
        
        override fun onAddTrack(receiver: RtpReceiver?, streams: Array<out MediaStream>?) {
            val expectedConnection = connectionRef.get()
            val applied = withCurrentPeerConnection(peerId, expectedConnection) {
                Log.d(TAG, "Track added for $peerId")
                receiver?.track()?.setEnabled(true)
                streams?.firstOrNull()?.let { stream ->
                    stream.audioTracks.forEach { track -> track.setEnabled(true) }
                    _remoteStreams.update { current ->
                        publishVersionedValue(current, peerId, stream)
                    }
                    emitEvent(WebRTCEvent.RemoteStreamAdded(peerId, stream))
                }
                true
            } == true
            if (applied) updateCommunicationAudioOwnership()
        }

        override fun onRemoveTrack(receiver: RtpReceiver?) {
            val expectedConnection = connectionRef.get()
            val applied = withCurrentPeerConnection(peerId, expectedConnection) {
                Log.d(TAG, "Track removed for $peerId")
                _remoteStreams.update { current ->
                    val stream = current[peerId]?.value ?: return@update current
                    publishVersionedValue(current, peerId, stream)
                }
                true
            } == true
            if (applied) updateCommunicationAudioOwnership()
        }
        
        override fun onConnectionChange(newState: PeerConnection.PeerConnectionState?) {
            val expectedConnection = connectionRef.get()
            var recoveryDelay: Long? = null
            var shouldRecover = false
            val applied = withCurrentPeerConnection(peerId, expectedConnection) {
                Log.d(TAG, "Connection state changed for $peerId: $newState")
                newState?.let { state ->
                    emitEvent(WebRTCEvent.ConnectionStateChanged(peerId, state))
                    when (state) {
                    PeerConnection.PeerConnectionState.CONNECTED -> {
                        connectionWatchdogs.remove(peerId)?.cancel()
                        recoveryAttempts.remove(peerId)
                    }
                    PeerConnection.PeerConnectionState.FAILED -> {
                        shouldRecover = true
                    }
                    PeerConnection.PeerConnectionState.DISCONNECTED -> {
                        shouldRecover = true
                        recoveryDelay = DISCONNECTED_RECOVERY_DELAY_MILLIS
                    }
                    else -> Unit
                    }
                }
                true
            } == true
            if (applied && shouldRecover) {
                schedulePeerRecovery(
                    peerId = peerId,
                    delayMillis = recoveryDelay,
                    expectedConnection = expectedConnection,
                )
            }
        }
    }

    private fun scheduleConnectionWatchdog(
        peerId: String,
        peerConnection: PeerConnection,
    ) {
        connectionWatchdogs.remove(peerId)?.cancel()
        val job = scope.launch {
            delay(INITIAL_CONNECTION_TIMEOUT_MILLIS)
            if (
                peerId in activePeerIds.get() &&
                peerConnections[peerId] === peerConnection &&
                peerConnection.connectionState() != PeerConnection.PeerConnectionState.CONNECTED
            ) {
                Log.w(TAG, "Call setup timed out for $peerId; rebuilding the peer")
                schedulePeerRecovery(peerId, expectedConnection = peerConnection)
            }
        }
        connectionWatchdogs[peerId] = job
        job.invokeOnCompletion { connectionWatchdogs.remove(peerId, job) }
    }

    private fun schedulePeerRecovery(
        peerId: String,
        delayMillis: Long? = null,
        force: Boolean = false,
        expectedConnection: PeerConnection? = null,
    ) {
        var failedConnection: PeerConnection? = null
        var attempt = 0
        val scheduled = synchronized(peerLifecycleLock) {
            if (peerId !in activePeerIds.get()) return@synchronized false
            val currentConnection = peerConnections[peerId] ?: return@synchronized false
            if (expectedConnection != null && currentConnection !== expectedConnection) {
                return@synchronized false
            }
            failedConnection = currentConnection
            if (force) forcedPeerRecoveries.add(peerId)
            if (!recoveriesInFlight.add(peerId)) return@synchronized false
            attempt = (recoveryAttempts[peerId] ?: 0) + 1
            if (attempt > 3) {
                emitEvent(WebRTCEvent.Error("Could not restore the call with $peerId"))
                recoveriesInFlight.remove(peerId)
                forcedPeerRecoveries.remove(peerId)
                return@synchronized false
            }
            recoveryAttempts[peerId] = attempt
            true
        }
        if (!scheduled) return
        val connectionToRecover = failedConnection ?: return

        val recoveryJob = scope.launch {
            delay(delayMillis ?: (500L * attempt))
            val forceRecovery = force || peerId in forcedPeerRecoveries
            if (shouldCancelPeerRecovery(
                    peerIsActive = peerId in activePeerIds.get(),
                    connectionIsCurrent = peerConnections[peerId] === connectionToRecover,
                    connectionIsConnected = connectionToRecover.connectionState() ==
                        PeerConnection.PeerConnectionState.CONNECTED,
                    force = forceRecovery,
                )
            ) {
                return@launch
            }
            // A recovery may happen near the end of short-lived TURN
            // credentials. Refresh through the TTL-aware repository before
            // constructing the replacement connection.
            prepareIceServers()
            val forceAfterRefresh = force || peerId in forcedPeerRecoveries
            if (shouldCancelPeerRecovery(
                    peerIsActive = peerId in activePeerIds.get(),
                    connectionIsCurrent = peerConnections[peerId] === connectionToRecover,
                    connectionIsConnected = connectionToRecover.connectionState() ==
                        PeerConnection.PeerConnectionState.CONNECTED,
                    force = forceAfterRefresh,
                )
            ) {
                return@launch
            }
            forcedPeerRecoveries.remove(peerId)
            // The final identity check and replacement happen under one
            // manager lifecycle lock, so another recovery cannot make this
            // job close a newly-created connection.
            rebuildPeerConnectionIfCurrent(
                peerId = peerId,
                expectedConnection = connectionToRecover,
                recoveryAttempt = attempt,
            )
        }
        recoveryJob.invokeOnCompletion {
            recoveriesInFlight.remove(peerId)
            // A signaling failure can upgrade a delayed transport recovery
            // while it is already in flight. If that job exited because the
            // transport reconnected, preserve the forced rebuild request.
            if (forcedPeerRecoveries.remove(peerId)) {
                schedulePeerRecovery(peerId, force = true)
            }
        }
    }
    
    private fun emitEvent(event: WebRTCEvent) {
        if (eventQueue.trySend(event).isFailure) {
            Log.e(TAG, "WebRTC event queue is unavailable")
        }
    }
}
