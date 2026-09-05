package tv.wehuddle.app.ui.screens.room

import android.Manifest
import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.clickable
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.IntOffset
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.core.content.ContextCompat
import androidx.core.app.ActivityCompat
import kotlinx.coroutines.launch
import tv.wehuddle.app.data.model.*
import tv.wehuddle.app.ui.components.*
import tv.wehuddle.app.data.model.PlaylistStateData
import tv.wehuddle.app.ui.screens.room.components.*
import tv.wehuddle.app.ui.theme.*
import tv.wehuddle.app.util.isTV
import tv.wehuddle.app.util.onDpadKeyEvent
import tv.wehuddle.app.util.rememberScreenSize
import tv.wehuddle.app.data.webrtc.VersionedValue
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import org.webrtc.EglBase
import org.webrtc.MediaStream
import android.util.Log

private const val TAG = "RoomScreen"

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

@Composable
fun RoomScreen(
    roomId: String,
    onNavigateBack: () -> Unit,
    onNavigateToLogin: (String) -> Unit,
    onNavigateToRegister: (String) -> Unit,
    viewModel: RoomViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val isTV = isTV()
    val screenSize = rememberScreenSize()
    val focusManager = LocalFocusManager.current
    val snackbarHostState = remember { SnackbarHostState() }
    val coroutineScope = rememberCoroutineScope()
    var askedForMicrophonePermission by rememberSaveable { mutableStateOf(false) }
    var askedForCameraPermission by rememberSaveable { mutableStateOf(false) }

    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, viewModel) {
        val observer = LifecycleEventObserver { _, event ->
            when (roomCallLifecycleAction(event)) {
                RoomCallLifecycleAction.SUSPEND -> viewModel.suspendCall()
                RoomCallLifecycleAction.RESUME -> viewModel.resumeCall()
                RoomCallLifecycleAction.NONE -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            viewModel.suspendCall()
        }
    }
    
    val roomState by viewModel.roomState.collectAsStateWithLifecycle()
    val connectionState by viewModel.connectionState.collectAsStateWithLifecycle()
    val participants by viewModel.participants.collectAsStateWithLifecycle()
    val chatMessages by viewModel.chatMessages.collectAsStateWithLifecycle()
    val activityLog by viewModel.activityLog.collectAsStateWithLifecycle()
    val videoUrl by viewModel.videoUrl.collectAsStateWithLifecycle()
    val chatInput by viewModel.chatInput.collectAsStateWithLifecycle()
    val copied by viewModel.copied.collectAsStateWithLifecycle()
    val authUser by viewModel.authUser.collectAsStateWithLifecycle()
    val isRoomSaved by viewModel.isRoomSaved.collectAsStateWithLifecycle()
    val saveBusy by viewModel.saveBusy.collectAsStateWithLifecycle()
    val callError by viewModel.callError.collectAsStateWithLifecycle()
    
    // WebRTC state
    val localStream by viewModel.localStream.collectAsStateWithLifecycle()
    val remoteStreams by viewModel.remoteStreams.collectAsStateWithLifecycle()
    // Collect EGL context as state to ensure recomposition when it becomes available
    val eglContext by viewModel.eglContext.collectAsStateWithLifecycle()

    val microphonePermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            viewModel.toggleMic()
        } else {
            coroutineScope.launch {
                val canAskAgain = context.findActivity()?.let { activity ->
                    ActivityCompat.shouldShowRequestPermissionRationale(
                        activity,
                        Manifest.permission.RECORD_AUDIO,
                    )
                } == true
                val result = snackbarHostState.showSnackbar(
                    message = if (canAskAgain) {
                        "Microphone access is needed so others can hear you."
                    } else {
                        "Microphone access is blocked. Enable it in system settings."
                    },
                    actionLabel = if (canAskAgain) null else "Settings",
                    withDismissAction = true,
                )
                if (!canAskAgain && result == SnackbarResult.ActionPerformed) {
                    context.startActivity(
                        Intent(
                            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                            Uri.fromParts("package", context.packageName, null),
                        )
                    )
                }
            }
        }
    }
    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            viewModel.toggleCam()
        } else {
            coroutineScope.launch {
                val canAskAgain = context.findActivity()?.let { activity ->
                    ActivityCompat.shouldShowRequestPermissionRationale(
                        activity,
                        Manifest.permission.CAMERA,
                    )
                } == true
                val result = snackbarHostState.showSnackbar(
                    message = if (canAskAgain) {
                        "Camera access is needed to share your video."
                    } else {
                        "Camera access is blocked. Enable it in system settings."
                    },
                    actionLabel = if (canAskAgain) null else "Settings",
                    withDismissAction = true,
                )
                if (!canAskAgain && result == SnackbarResult.ActionPerformed) {
                    context.startActivity(
                        Intent(
                            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                            Uri.fromParts("package", context.packageName, null),
                        )
                    )
                }
            }
        }
    }

    val onToggleMic: () -> Unit = {
        if (
            roomState.localMediaState.mic ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            viewModel.toggleMic()
        } else {
            val shouldExplain = askedForMicrophonePermission &&
                context.findActivity()?.let { activity ->
                    ActivityCompat.shouldShowRequestPermissionRationale(
                        activity,
                        Manifest.permission.RECORD_AUDIO,
                    )
                } == true
            askedForMicrophonePermission = true
            if (shouldExplain) {
                coroutineScope.launch {
                    val result = snackbarHostState.showSnackbar(
                        message = "Voice chat needs microphone access.",
                        actionLabel = "Continue",
                        withDismissAction = true,
                    )
                    if (result == SnackbarResult.ActionPerformed) {
                        microphonePermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                    }
                }
            } else {
                microphonePermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
            }
        }
    }
    val onToggleCam: () -> Unit = {
        if (
            roomState.localMediaState.cam ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            viewModel.toggleCam()
        } else {
            val shouldExplain = askedForCameraPermission &&
                context.findActivity()?.let { activity ->
                    ActivityCompat.shouldShowRequestPermissionRationale(
                        activity,
                        Manifest.permission.CAMERA,
                    )
                } == true
            askedForCameraPermission = true
            if (shouldExplain) {
                coroutineScope.launch {
                    val result = snackbarHostState.showSnackbar(
                        message = "Video chat needs camera access.",
                        actionLabel = "Continue",
                        withDismissAction = true,
                    )
                    if (result == SnackbarResult.ActionPerformed) {
                        cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                    }
                }
            } else {
                cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
            }
        }
    }

    LaunchedEffect(callError) {
        callError?.let { message ->
            snackbarHostState.showSnackbar(
                message = message,
                withDismissAction = true,
            )
            viewModel.clearCallError()
        }
    }
    
    // Wheel picker state
    val showWheelPicker by viewModel.showWheelPicker.collectAsStateWithLifecycle()
    val wheelState by viewModel.wheelState.collectAsStateWithLifecycle()
    val wheelEntryInput by viewModel.wheelEntryInput.collectAsStateWithLifecycle()
    
    // Playlist state
    val showPlaylistPanel by viewModel.showPlaylistPanel.collectAsStateWithLifecycle()
    val playlistState by viewModel.playlistState.collectAsStateWithLifecycle()
    
    // Tab state
    var selectedTab by remember { mutableIntStateOf(0) }
    val tabs = listOf("Video", "Controls", "Activity")
    
    // Fullscreen state
    var isFullscreen by remember { mutableStateOf(false) }
    
    // Log fullscreen state changes
    LaunchedEffect(isFullscreen) {
        Log.d(TAG, "Fullscreen state changed: isFullscreen=$isFullscreen")
    }
    
    var fullscreenWebcamPosition by remember { mutableStateOf(WebcamPosition.TOP_RIGHT) }
    var fullscreenWebcamSize by remember { mutableStateOf(WebcamSize.MEDIUM) }
    var fullscreenShowWebcams by remember { mutableStateOf(true) }
    var fullscreenShowChat by remember { mutableStateOf(false) }
    
    // Focus requesters for TV
    val playButtonFocusRequester = remember { FocusRequester() }
    val tabFocusRequesters = remember { List(tabs.size) { FocusRequester() } }
    
    // Define colors locally if not in theme
    val Slate950 = Color(0xFF020617)
    val Slate900 = Color(0xFF0F172A)
    val Slate400 = Color(0xFF94A3B8)
    val Slate50 = Color(0xFFF8FAFC)
    val Blue500 = Color(0xFF3B82F6)
    
    // Password state from room
    val passwordRequired = roomState.passwordRequired
    val passwordInput by viewModel.passwordInput.collectAsStateWithLifecycle()
    val accessSurface = roomAccessSurface(
        passwordRequired = passwordRequired,
        connectionState = connectionState,
        userId = roomState.userId,
        error = roomState.error,
    )

    // The requester is attached only inside the authorized wide-TV layout.
    // Wait for that composition before moving focus; every room begins behind
    // the membership gate and requesting sooner throws on TV.
    LaunchedEffect(isTV, screenSize.isWide, accessSurface) {
        if (shouldRequestInitialTvFocus(isTV, screenSize.isWide, accessSurface)) {
            withFrameNanos { }
            playButtonFocusRequester.requestFocus()
        }
    }
    
    // Build remote streams info for fullscreen
    // Use participants list as the source (has mediaState), and join with remoteStreams for actual video
    val remoteStreamInfoList = remember(remoteStreams, participants, roomState.userId) {
        // Build from participants (not remoteStreams) so we include everyone with camera on
        // even if WebRTC stream isn't established yet
        participants
            .filter { it.id != roomState.userId } // Exclude self
            .map { participant ->
                val stream = remoteStreams[participant.id]?.value
                RemoteStreamInfo(
                    peerId = participant.id,
                    stream = stream,
                    mediaState = participant.mediaState,
                    username = participant.username ?: participant.id.take(8)
                )
            }
    }
    
    // Fullscreen player overlay state
    val effectiveVolume = roomState.videoState.localVolumeOverride ?: roomState.videoState.volume
    val effectiveMuted = roomState.videoState.localMutedOverride ?: roomState.videoState.isMuted
    
    // Root Box to contain layouts and fullscreen overlay
    Box(modifier = Modifier.fillMaxSize()) {
        when (accessSurface) {
            RoomAccessSurface.PASSWORD -> PasswordModal(
                passwordInput = passwordInput,
                onPasswordChange = viewModel::updatePasswordInput,
                onSubmit = viewModel::submitPassword,
                error = roomState.passwordError,
            )
            RoomAccessSurface.JOINING -> RoomMembershipGate(
                error = null,
                onNavigateBack = onNavigateBack,
            )
            RoomAccessSurface.DENIED -> RoomMembershipGate(
                error = roomState.error,
                onNavigateBack = onNavigateBack,
            )
            RoomAccessSurface.ROOM -> if (isTV && screenSize.isWide) {
                // TV Wide Layout - Side by side
                TvWideRoomLayout(
                roomId = roomId,
                roomState = roomState,
                connectionState = connectionState,
                participants = participants,
                chatMessages = chatMessages,
                activityLog = activityLog,
                videoUrl = videoUrl,
                chatInput = chatInput,
                copied = copied,
                authUser = authUser,
                isRoomSaved = isRoomSaved,
                saveBusy = saveBusy,
                showWheelPicker = showWheelPicker,
                wheelState = wheelState,
                wheelEntryInput = wheelEntryInput,
                showPlaylistPanel = showPlaylistPanel,
                playlistState = playlistState,
                viewModel = viewModel,
                onNavigateBack = onNavigateBack,
                onNavigateToLogin = onNavigateToLogin,
                onNavigateToRegister = onNavigateToRegister,
                context = context,
                playButtonFocusRequester = playButtonFocusRequester,
                eglContext = eglContext,
                localStream = localStream,
                remoteStreams = remoteStreams,
                onToggleMic = onToggleMic,
                onToggleCam = onToggleCam,
                onEnterFullscreen = { 
                    Log.d(TAG, "TvWideRoomLayout: onEnterFullscreen called")
                    isFullscreen = true 
                },
                isFullscreen = isFullscreen
                )
            } else {
                // Mobile/Compact TV Layout - Tabbed
                MobileRoomLayout(
                roomId = roomId,
                roomState = roomState,
                connectionState = connectionState,
                participants = participants,
                chatMessages = chatMessages,
                activityLog = activityLog,
                videoUrl = videoUrl,
                chatInput = chatInput,
                copied = copied,
                authUser = authUser,
                isRoomSaved = isRoomSaved,
                saveBusy = saveBusy,
                showWheelPicker = showWheelPicker,
                wheelState = wheelState,
                wheelEntryInput = wheelEntryInput,
                showPlaylistPanel = showPlaylistPanel,
                playlistState = playlistState,
                selectedTab = selectedTab,
                onTabSelected = { selectedTab = it },
                tabs = tabs,
                viewModel = viewModel,
                onNavigateBack = onNavigateBack,
                onNavigateToLogin = onNavigateToLogin,
                onNavigateToRegister = onNavigateToRegister,
                context = context,
                isTV = isTV,
                isHeightCompact = screenSize.heightDp < 480.dp,
                onEnterFullscreen = { isFullscreen = true },
                isFullscreen = isFullscreen,
                eglContext = eglContext,
                localStream = localStream,
                remoteStreams = remoteStreams,
                onToggleMic = onToggleMic,
                onToggleCam = onToggleCam,
                )
            }
        }
        
        // Fullscreen player overlay - placed LAST so it appears on top
        if (accessSurface == RoomAccessSurface.ROOM) FullscreenPlayerOverlay(
            isFullscreen = isFullscreen,
            onExitFullscreen = { isFullscreen = false },
            videoUrl = roomState.videoState.url,
            isPlaying = roomState.videoState.isPlaying,
            currentTime = roomState.videoState.currentTime,
            duration = roomState.videoState.duration,
            volume = effectiveVolume,
            isMuted = effectiveMuted,
            playbackSpeed = roomState.videoState.playbackSpeed,
            onPlay = { viewModel.onPlay(roomState.videoState.currentTime) },
            onPause = { viewModel.onPause(roomState.videoState.currentTime) },
            onSeek = { time -> viewModel.onSeek(time) },
            // DON'T update state from fullscreen - it causes constant re-renders and buffering
            // Fullscreen player plays independently using the initial state
            onProgress = { _, _ -> /* No-op: fullscreen is independent */ },
            onReady = { },
            onError = { error -> viewModel.updateVideoState { it.copy(error = error) } },
            onUrlChange = { newUrl ->
                // When user selects content in Netflix, sync it to the room
                viewModel.updateVideoUrl(newUrl)
                viewModel.loadVideo()
            },
            eglContext = eglContext,
            localStream = localStream,
            localMediaState = roomState.localMediaState,
            remoteStreams = remoteStreamInfoList,
            localUsername = authUser?.username ?: roomState.userId.take(8),
            onToggleMic = onToggleMic,
            onToggleCam = onToggleCam,
            chatMessages = chatMessages,
            chatInput = chatInput,
            currentUserId = roomState.userId,
            onChatInputChange = viewModel::updateChatInput,
            onSendChat = viewModel::sendChatMessage,
            webcamPosition = fullscreenWebcamPosition,
            webcamSize = fullscreenWebcamSize,
            showWebcams = fullscreenShowWebcams,
            showChat = fullscreenShowChat,
            onWebcamPositionChange = { fullscreenWebcamPosition = it },
            onWebcamSizeChange = { fullscreenWebcamSize = it },
            onShowWebcamsChange = { fullscreenShowWebcams = it },
            onShowChatChange = { fullscreenShowChat = it }
        )

        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier.align(Alignment.BottomCenter)
        )
    }
}

@Composable
private fun RoomMembershipGate(
    error: String?,
    onNavigateBack: () -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background,
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            if (error == null) {
                CircularProgressIndicator(modifier = Modifier.size(32.dp))
                Spacer(Modifier.height(20.dp))
                Text(
                    text = "Joining room…",
                    style = MaterialTheme.typography.titleMedium,
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    text = "Checking access before enabling your microphone and camera.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodyMedium,
                )
            } else {
                Icon(
                    imageVector = Icons.Default.Lock,
                    contentDescription = null,
                    modifier = Modifier.size(36.dp),
                    tint = MaterialTheme.colorScheme.error,
                )
                Spacer(Modifier.height(16.dp))
                Text(
                    text = "Unable to join room",
                    style = MaterialTheme.typography.titleMedium,
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    text = error,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.height(20.dp))
                Button(onClick = onNavigateBack) {
                    Text("Go back")
                }
            }
        }
    }
}

@Composable
private fun TvWideRoomLayout(
    roomId: String,
    roomState: RoomUiState,
    connectionState: ConnectionState,
    participants: List<Participant>,
    chatMessages: List<ChatMessage>,
    activityLog: List<ActivityLogEntry>,
    videoUrl: String,
    chatInput: String,
    copied: Boolean,
    authUser: tv.wehuddle.app.data.model.AuthUser?,
    isRoomSaved: Boolean,
    saveBusy: Boolean,
    showWheelPicker: Boolean,
    wheelState: WheelState,
    wheelEntryInput: String,
    showPlaylistPanel: Boolean,
    playlistState: PlaylistStateData,
    viewModel: RoomViewModel,
    onNavigateBack: () -> Unit,
    onNavigateToLogin: (String) -> Unit,
    onNavigateToRegister: (String) -> Unit,
    context: Context,
    playButtonFocusRequester: FocusRequester,
    eglContext: EglBase.Context?,
    localStream: MediaStream?,
    remoteStreams: Map<String, VersionedValue<MediaStream>>,
    onToggleMic: () -> Unit,
    onToggleCam: () -> Unit,
    onEnterFullscreen: () -> Unit,
    isFullscreen: Boolean = false
) {
    val Slate950 = Color(0xFF020617)
    val Slate900 = Color(0xFF0F172A)
    val Slate800 = Color(0xFF1E293B)
    
    // Track if chat panel is visible
    var showChatPanel by remember { mutableStateOf(false) }
    
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Slate950)
            .onDpadKeyEvent(
                onBack = {
                    if (showChatPanel) {
                        showChatPanel = false
                        true
                    } else {
                        onNavigateBack()
                        true
                    }
                },
                onPlayPause = {
                    if (roomState.videoState.isPlaying) {
                        viewModel.onPause(roomState.videoState.currentTime)
                    } else {
                        viewModel.onPlay(roomState.videoState.currentTime)
                    }
                    true
                }
            )
    ) {
        // Main content - Full screen video
        Column(
            modifier = Modifier.fillMaxSize()
        ) {
            // Compact TV Header - minimal, shows essential info
            TvRoomHeader(
                roomId = roomId,
                isConnected = connectionState == ConnectionState.CONNECTED,
                participantCount = participants.size,
                onBack = onNavigateBack
            )

            RoomCallStrip(
                eglContext = eglContext,
                localUserId = roomState.userId,
                localUsername = authUser?.username ?: roomState.userId.take(8),
                localStream = localStream,
                localMediaState = roomState.localMediaState,
                localIsSpeaking = roomState.isSpeaking,
                participants = participants,
                remoteStreams = remoteStreams,
                onToggleMic = onToggleMic,
                onToggleCamera = onToggleCam,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp, vertical = 8.dp),
                isTv = true,
            )
            
            // Video Player - Takes most of the screen
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp, vertical = 8.dp)
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .clip(RoundedCornerShape(16.dp))
                        .background(Color.Black),
                    contentAlignment = Alignment.Center
                ) {
                    val effectiveVolume = roomState.videoState.localVolumeOverride ?: roomState.videoState.volume
                    val effectiveMuted = roomState.videoState.localMutedOverride ?: roomState.videoState.isMuted

                    if (roomState.videoState.url.isNotEmpty()) {
                        VideoPlayerView(
                            url = roomState.videoState.url,
                            // Pause main player when fullscreen is active to avoid dual playback
                            isPlaying = roomState.videoState.isPlaying && !isFullscreen,
                            currentTime = roomState.videoState.currentTime,
                            volume = effectiveVolume,
                            isMuted = effectiveMuted,
                            playbackSpeed = roomState.videoState.playbackSpeed,
                            onPlay = { viewModel.onPlay(roomState.videoState.currentTime) },
                            onPause = { viewModel.onPause(roomState.videoState.currentTime) },
                            onSeek = { time -> viewModel.onSeek(time) },
                            onProgress = { currentTime, duration ->
                                // Skip local progress updates if a remote sync was received recently
                                // This prevents the local playback position from overwriting the sync position
                                val timeSinceSync = System.currentTimeMillis() - roomState.videoState.lastRemoteSyncAt
                                // Only update progress when not in fullscreen and sync cooldown passed
                                if (!isFullscreen && timeSinceSync > 1500) {
                                    viewModel.updateVideoState { it.copy(currentTime = currentTime, duration = duration) }
                                } else if (!isFullscreen) {
                                    // Still update duration but not currentTime during sync cooldown
                                    viewModel.updateVideoState { it.copy(duration = duration) }
                                }
                            },
                            onReady = {
                                viewModel.updateVideoState { it.copy(isReady = true) }
                            },
                            onError = { error ->
                                viewModel.updateVideoState { it.copy(error = error) }
                            },
                            modifier = Modifier.fillMaxSize(),
                            lastRemoteSyncAt = roomState.videoState.lastRemoteSyncAt,
                            onUrlChange = { newUrl ->
                                // When user selects content in Netflix, sync it to the room
                                viewModel.updateVideoUrl(newUrl)
                                viewModel.loadVideo()
                            },
                            onBuffering = { buffering ->
                                viewModel.updateVideoState { it.copy(isBuffering = buffering) }
                            },
                            onAutoPause = { position ->
                                // Player went paused on its own (audio focus loss, etc.);
                                // tell the room so it doesn't keep playing without us.
                                viewModel.onPause(position)
                            }
                        )
                    } else {
                        // No video - Show helpful message for TV users
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center
                        ) {
                            Icon(
                                Icons.Default.Tv,
                                contentDescription = null,
                                tint = Color(0xFF64748B),
                                modifier = Modifier.size(96.dp)
                            )
                            Spacer(Modifier.height(24.dp))
                            Text(
                                "Waiting for video...",
                                color = Color.White,
                                fontSize = 24.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(Modifier.height(12.dp))
                            Text(
                                "Load a video from your phone or computer",
                                color = Color(0xFF94A3B8),
                                fontSize = 18.sp
                            )
                            Spacer(Modifier.height(8.dp))
                            Text(
                                "Room: $roomId",
                                color = Color(0xFF64748B),
                                fontSize = 14.sp
                            )
                        }
                    }
                }
                
                // Connection status overlay (top right of video)
                if (connectionState != ConnectionState.CONNECTED) {
                    Surface(
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .padding(16.dp),
                        color = Color(0xFFF43F5E).copy(alpha = 0.9f),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                color = Color.White,
                                strokeWidth = 2.dp
                            )
                            Text(
                                "Connecting...",
                                color = Color.White,
                                fontSize = 14.sp
                            )
                        }
                    }
                }
                
                // Participant count overlay (top left of video)
                Surface(
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(16.dp),
                    color = Slate800.copy(alpha = 0.9f),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .background(Color(0xFF22C55E), CircleShape)
                        )
                        Text(
                            "${participants.size} watching",
                            color = Color.White,
                            fontSize = 14.sp
                        )
                    }
                }
            }
            
            // TV-optimized playback controls
            TvPlaybackControls(
                isPlaying = roomState.videoState.isPlaying,
                currentTime = roomState.videoState.currentTime,
                duration = roomState.videoState.duration,
                onPlay = { viewModel.onPlay(roomState.videoState.currentTime) },
                onPause = { viewModel.onPause(roomState.videoState.currentTime) },
                onSeekForward = { viewModel.onSeek(roomState.videoState.currentTime + 10.0) },
                onSeekBackward = { viewModel.onSeek(maxOf(0.0, roomState.videoState.currentTime - 10.0)) },
                onSync = { 
                    Log.d(TAG, "Sync button clicked")
                    viewModel.requestSync() 
                },
                onFullscreen = {
                    Log.d(TAG, "Fullscreen button clicked in TvPlaybackControls")
                    onEnterFullscreen()
                },
                playButtonFocusRequester = playButtonFocusRequester,
                isMicEnabled = roomState.localMediaState.mic,
                isCamEnabled = roomState.localMediaState.cam,
                onToggleMic = onToggleMic,
                onToggleCam = onToggleCam,
                showChatButton = true,
                onChatToggle = { showChatPanel = !showChatPanel },
                chatUnread = chatMessages.isNotEmpty()
            )
            
            Spacer(Modifier.height(16.dp))
        }
        
        // Slide-in Chat Panel (from right side)
        androidx.compose.animation.AnimatedVisibility(
            visible = showChatPanel,
            modifier = Modifier.align(Alignment.CenterEnd),
            enter = androidx.compose.animation.slideInHorizontally { it },
            exit = androidx.compose.animation.slideOutHorizontally { it }
        ) {
            TvChatPanel(
                chatMessages = chatMessages,
                chatInput = chatInput,
                currentUserId = roomState.userId,
                onChatInputChange = viewModel::updateChatInput,
                onSendChat = viewModel::sendChatMessage,
                onClose = { showChatPanel = false }
            )
        }
    }
    
    // Wheel Picker Modal
    if (showWheelPicker) {
        AnimatedWheelPickerModal(
            entries = wheelState.entries,
            entryInput = wheelEntryInput,
            lastSpin = wheelState.lastSpin?.let { spin ->
                WheelSpunData(
                    roomId = roomId,
                    index = spin.index,
                    result = spin.result,
                    entryCount = spin.entryCount,
                    spunAt = spin.spunAt,
                    senderId = spin.senderId,
                    entries = wheelState.entries
                )
            },
            isConnected = connectionState == ConnectionState.CONNECTED,
            onEntryInputChange = { text -> viewModel.updateWheelEntryInput(text) },
            onAddEntry = { viewModel.addWheelEntry() },
            onRemoveEntry = { index -> viewModel.removeWheelEntry(index) },
            onClearAll = { viewModel.clearWheelEntries() },
            onSpin = { viewModel.spinWheel() },
            onDismiss = { viewModel.closeWheelPicker() }
        )
    }
}

@Composable
private fun TvRoomHeader(
    roomId: String,
    isConnected: Boolean,
    participantCount: Int,
    onBack: () -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = Color(0xFF0F172A)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                TvIconButton(
                    onClick = onBack,
                    icon = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Back"
                )
                
                Text(text = "🍿", style = TextStyle(fontSize = 28.sp))
                Text(
                    text = "Huddle",
                    style = TextStyle(
                        color = Color.White,
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold
                    )
                )
                
                Surface(
                    color = Color(0xFF1E293B),
                    shape = RoundedCornerShape(20.dp)
                ) {
                    Text(
                        text = roomId,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                        style = TextStyle(
                            color = Color(0xFF94A3B8),
                            fontSize = 14.sp
                        )
                    )
                }
            }
            
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text(
                    "Use ◀ ▶ to seek, ENTER to play/pause",
                    color = Color(0xFF64748B),
                    fontSize = 14.sp
                )
                
                Box(
                    modifier = Modifier
                        .size(12.dp)
                        .background(
                            if (isConnected) Color(0xFF22C55E) else Color(0xFFF43F5E),
                            CircleShape
                        )
                )
            }
        }
    }
}

@Composable
private fun TvPlaybackControls(
    isPlaying: Boolean,
    currentTime: Double,
    duration: Double,
    onPlay: () -> Unit,
    onPause: () -> Unit,
    onSeekForward: () -> Unit,
    onSeekBackward: () -> Unit,
    onSync: () -> Unit,
    onFullscreen: () -> Unit,
    playButtonFocusRequester: FocusRequester,
    isMicEnabled: Boolean,
    isCamEnabled: Boolean,
    onToggleMic: () -> Unit,
    onToggleCam: () -> Unit,
    showChatButton: Boolean = false,
    onChatToggle: () -> Unit = {},
    chatUnread: Boolean = false
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp),
        color = Color(0xFF1E293B),
        shape = RoundedCornerShape(16.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Left - Time and progress
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text(
                    formatTime(currentTime),
                    color = Color.White,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Medium
                )
                
                // Progress indicator
                Box(
                    modifier = Modifier
                        .width(200.dp)
                        .height(4.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(Color(0xFF334155))
                ) {
                    val progress = if (duration > 0) (currentTime / duration).toFloat().coerceIn(0f, 1f) else 0f
                    Box(
                        modifier = Modifier
                            .fillMaxHeight()
                            .fillMaxWidth(progress)
                            .background(Color(0xFF3B82F6))
                    )
                }
                
                Text(
                    formatTime(duration),
                    color = Color(0xFF94A3B8),
                    fontSize = 18.sp
                )
            }
            
            // Center - Playback controls
            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Seek backward
                TvIconButton(
                    onClick = onSeekBackward,
                    icon = Icons.Default.Replay10,
                    contentDescription = "Rewind 10s",
                    size = 52.dp,
                    iconSize = 28.dp
                )
                
                // Play/Pause
                TvPrimaryButton(
                    onClick = if (isPlaying) onPause else onPlay,
                    focusRequester = playButtonFocusRequester,
                    modifier = Modifier.size(64.dp)
                ) {
                    Icon(
                        imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                        contentDescription = if (isPlaying) "Pause" else "Play",
                        modifier = Modifier.size(32.dp)
                    )
                }
                
                // Seek forward
                TvIconButton(
                    onClick = onSeekForward,
                    icon = Icons.Default.Forward10,
                    contentDescription = "Forward 10s",
                    size = 52.dp,
                    iconSize = 28.dp
                )
                
                // Sync button - force re-sync with room
                TvIconButton(
                    onClick = onSync,
                    icon = Icons.Default.Sync,
                    contentDescription = "Sync with room",
                    size = 52.dp,
                    iconSize = 24.dp
                )
                
                // Fullscreen button
                TvIconButton(
                    onClick = onFullscreen,
                    icon = Icons.Default.Fullscreen,
                    contentDescription = "Fullscreen",
                    size = 52.dp,
                    iconSize = 28.dp
                )
            }
            
            // Right - Personal call controls and chat
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                TvCallControl(
                    enabled = isMicEnabled,
                    deviceName = "microphone",
                    enabledIcon = Icons.Default.Mic,
                    disabledIcon = Icons.Default.MicOff,
                    enabledLabel = "Mic on",
                    disabledLabel = "Mic off",
                    onClick = onToggleMic,
                )

                TvCallControl(
                    enabled = isCamEnabled,
                    deviceName = "camera",
                    enabledIcon = Icons.Default.Videocam,
                    disabledIcon = Icons.Default.VideocamOff,
                    enabledLabel = "Camera on",
                    disabledLabel = "Camera off",
                    onClick = onToggleCam,
                )
                
                if (showChatButton) {
                    Box {
                        TvSecondaryButton(
                            onClick = onChatToggle
                        ) {
                            Icon(
                                Icons.AutoMirrored.Filled.Chat,
                                contentDescription = "Chat",
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(Modifier.width(8.dp))
                            Text("Chat", fontSize = 16.sp)
                        }
                        
                        // Unread indicator
                        if (chatUnread) {
                            Box(
                                modifier = Modifier
                                    .align(Alignment.TopEnd)
                                    .offset(x = 4.dp, y = (-4).dp)
                                    .size(12.dp)
                                    .background(Color(0xFF3B82F6), CircleShape)
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TvCallControl(
    enabled: Boolean,
    deviceName: String,
    enabledIcon: androidx.compose.ui.graphics.vector.ImageVector,
    disabledIcon: androidx.compose.ui.graphics.vector.ImageVector,
    enabledLabel: String,
    disabledLabel: String,
    onClick: () -> Unit,
) {
    val label = if (enabled) enabledLabel else disabledLabel

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        TvIconButton(
            onClick = onClick,
            icon = if (enabled) enabledIcon else disabledIcon,
            contentDescription = "Turn $deviceName ${if (enabled) "off" else "on"}",
            isActive = enabled,
            size = 44.dp,
            iconSize = 22.dp,
        )
        Text(
            text = label,
            color = if (enabled) Color(0xFFA7F3D0) else Color(0xFFCBD5E1),
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
        )
    }
}

@Composable
private fun TvChatPanel(
    chatMessages: List<ChatMessage>,
    chatInput: String,
    currentUserId: String,
    onChatInputChange: (String) -> Unit,
    onSendChat: () -> Unit,
    onClose: () -> Unit
) {
    Surface(
        modifier = Modifier
            .width(400.dp)
            .fillMaxHeight(),
        color = Color(0xFF0F172A),
        shape = RoundedCornerShape(topStart = 16.dp, bottomStart = 16.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp)
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "Chat",
                    color = Color.White,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold
                )
                TvIconButton(
                    onClick = onClose,
                    icon = Icons.Default.Close,
                    contentDescription = "Close chat",
                    size = 40.dp,
                    iconSize = 20.dp
                )
            }
            
            Spacer(Modifier.height(16.dp))
            
            // Messages
            LazyColumn(
                modifier = Modifier.weight(1f),
                reverseLayout = true,
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(chatMessages.reversed()) { msg ->
                    val isOwn = msg.senderId == currentUserId
                    val senderLabel = if (isOwn) "You" else msg.senderUsername?.takeIf { it.isNotBlank() } ?: msg.senderId.take(8)
                    
                    Surface(
                        color = if (isOwn) Color(0xFF1E3A5F) else Color(0xFF1E293B),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(12.dp)
                        ) {
                            Text(
                                senderLabel,
                                color = if (isOwn) Color(0xFF60A5FA) else Color(0xFF94A3B8),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                            Spacer(Modifier.height(4.dp))
                            Text(
                                msg.text,
                                color = Color(0xFFE2E8F0),
                                fontSize = 14.sp
                            )
                        }
                    }
                }
                
                if (chatMessages.isEmpty()) {
                    item {
                        Text(
                            "No messages yet",
                            color = Color(0xFF64748B),
                            fontSize = 14.sp,
                            modifier = Modifier.fillMaxWidth(),
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }
                }
            }
            
            Spacer(Modifier.height(16.dp))
            
            // Input
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                TvTextField(
                    value = chatInput,
                    onValueChange = onChatInputChange,
                    placeholder = "Type a message...",
                    modifier = Modifier.weight(1f)
                )
                TvIconButton(
                    onClick = onSendChat,
                    icon = Icons.AutoMirrored.Filled.Send,
                    contentDescription = "Send"
                )
            }
        }
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

@Composable
private fun MobileRoomLayout(
    roomId: String,
    roomState: RoomUiState,
    connectionState: ConnectionState,
    participants: List<Participant>,
    chatMessages: List<ChatMessage>,
    activityLog: List<ActivityLogEntry>,
    videoUrl: String,
    chatInput: String,
    copied: Boolean,
    authUser: tv.wehuddle.app.data.model.AuthUser?,
    isRoomSaved: Boolean,
    saveBusy: Boolean,
    showWheelPicker: Boolean,
    wheelState: WheelState,
    wheelEntryInput: String,
    showPlaylistPanel: Boolean,
    playlistState: PlaylistStateData,
    selectedTab: Int,
    onTabSelected: (Int) -> Unit,
    tabs: List<String>,
    viewModel: RoomViewModel,
    onNavigateBack: () -> Unit,
    onNavigateToLogin: (String) -> Unit,
    onNavigateToRegister: (String) -> Unit,
    context: Context,
    isTV: Boolean,
    isHeightCompact: Boolean,
    onEnterFullscreen: () -> Unit,
    isFullscreen: Boolean = false,
    eglContext: EglBase.Context?,
    localStream: MediaStream?,
    remoteStreams: Map<String, VersionedValue<MediaStream>>,
    onToggleMic: () -> Unit,
    onToggleCam: () -> Unit,
) {
    val Slate950 = Color(0xFF020617)
    val Slate900 = Color(0xFF0F172A)
    val Slate400 = Color(0xFF94A3B8)
    val Slate50 = Color(0xFFF8FAFC)
    val Blue500 = Color(0xFF3B82F6)

    // Theatre mode: hides tabs, URL input, bottom bar, and the chat preview to
    // maximize the video area — mirrors the web app's theatre mode (which hides
    // the left call sidebar). Force-select the Video tab whenever it turns on.
    var isTheatreMode by remember { mutableStateOf(false) }
    LaunchedEffect(isTheatreMode) {
        if (isTheatreMode && selectedTab != 0) onTabSelected(0)
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(roomAmbientBackground())
    ) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .imePadding()
    ) {
        // 1. Header (Always Visible)
        RoomHeader(
            roomId = roomId,
            isConnected = connectionState == ConnectionState.CONNECTED,
            hasRoomPassword = roomState.hasRoomPassword,
            copied = copied,
            authUsername = authUser?.username,
            canSave = authUser != null,
            isSaved = isRoomSaved,
            saveBusy = saveBusy,
            onLogin = { onNavigateToLogin("room/$roomId") },
            onRegister = { onNavigateToRegister("room/$roomId") },
            onToggleSave = viewModel::toggleSaveRoom,
            onCopyInvite = {
                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                val clip = ClipData.newPlainText("Huddle Invite", viewModel.getInviteLink())
                clipboard.setPrimaryClip(clip)
                viewModel.setCopied(true)
            },
            onOpenWheel = viewModel::toggleWheelPicker,
            onOpenPlaylist = viewModel::openPlaylistPanel,
            onBack = onNavigateBack
        )

        if (!isTheatreMode) {
            RoomCallStrip(
                eglContext = eglContext,
                localUserId = roomState.userId,
                localUsername = authUser?.username ?: roomState.userId.take(8),
                localStream = localStream,
                localMediaState = roomState.localMediaState,
                localIsSpeaking = roomState.isSpeaking,
                participants = participants,
                remoteStreams = remoteStreams,
                onToggleMic = onToggleMic,
                onToggleCamera = onToggleCam,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = if (isTV) 16.dp else 10.dp, vertical = 8.dp),
                isTv = isTV,
                isHeightCompact = isHeightCompact,
            )
        }

        // 2. Tabs (hidden only in theatre mode). Compact landscape keeps a
        // shorter switcher so rotation can never strand another tab.
        if (!isTheatreMode) {
        if (isTV) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Slate900)
                    .padding(
                        horizontal = if (isHeightCompact) 8.dp else 16.dp,
                        vertical = if (isHeightCompact) 4.dp else 8.dp,
                    ),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                tabs.forEachIndexed { index, title ->
                    TvTab(
                        selected = selectedTab == index,
                        onClick = { onTabSelected(index) },
                        text = title
                    )
                }
            }
        } else {
            TabRow(
                selectedTabIndex = selectedTab,
                containerColor = Slate900,
                contentColor = Slate400,
                indicator = { tabPositions ->
                    TabRowDefaults.SecondaryIndicator(
                        modifier = Modifier.tabIndicatorOffset(tabPositions[selectedTab]),
                        height = 2.dp,
                        color = Blue500
                    )
                },
                divider = { HorizontalDivider(color = Color(0xFF1E293B)) }
            ) {
                tabs.forEachIndexed { index, title ->
                    Tab(
                        selected = selectedTab == index,
                        onClick = { onTabSelected(index) },
                        modifier = Modifier.height(if (isHeightCompact) 36.dp else 48.dp),
                        text = {
                            Text(
                                text = title,
                                style = TextStyle(
                                    fontSize = if (isHeightCompact) 12.sp else 14.sp,
                                    fontWeight = if (selectedTab == index) FontWeight.Bold else FontWeight.Medium,
                                    color = if (selectedTab == index) Slate50 else Slate400
                                )
                            )
                        }
                    )
                }
            }
        }
        } // end !isTheatreMode tabs

        // 3. Content Area (Flexible Weight)
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
        ) {
            when (selectedTab) {
                0 -> VideoTabContent(
                    videoUrl = videoUrl,
                    onVideoUrlChange = viewModel::updateVideoUrl,
                    onLoadVideo = viewModel::loadVideo,
                    roomState = roomState,
                    viewModel = viewModel,
                    chatMessages = chatMessages,
                    chatInput = chatInput,
                    onChatInputChange = viewModel::updateChatInput,
                    onSendChat = viewModel::sendChatMessage,
                    modifier = Modifier.verticalScroll(rememberScrollState()),
                    isTV = isTV,
                    onEnterFullscreen = onEnterFullscreen,
                    isFullscreen = isFullscreen,
                    isTheatreMode = isTheatreMode,
                    onToggleTheatreMode = { isTheatreMode = !isTheatreMode }
                )
                1 -> ControlsTabContent(
                    viewModel = viewModel,
                    roomState = roomState,
                    isHost = viewModel.isHost(),
                    modifier = Modifier.verticalScroll(rememberScrollState()),
                    isTV = isTV,
                    onToggleMic = onToggleMic,
                    onToggleCam = onToggleCam,
                )
                2 -> ActivityTabContent(
                    activityLog = activityLog,
                    chatMessages = chatMessages,
                    chatInput = chatInput,
                    onChatInputChange = viewModel::updateChatInput,
                    onSendChat = viewModel::sendChatMessage,
                    localUserId = roomState.userId,
                    isTV = isTV
                )
            }
        }

        // 4. Bottom Bar (hidden in theatre mode)
        if (!isTheatreMode) {
            BottomMediaBar(
                micEnabled = roomState.localMediaState.mic,
                camEnabled = roomState.localMediaState.cam,
                participants = participants,
                onToggleMic = onToggleMic,
                onToggleCam = onToggleCam,
            )
        }
    }
    } // End of ambient-background Box

    // Animated Wheel Picker Modal
    if (showWheelPicker) {
        AnimatedWheelPickerModal(
            entries = wheelState.entries,
            entryInput = wheelEntryInput,
            lastSpin = wheelState.lastSpin?.let { spin ->
                tv.wehuddle.app.data.model.WheelSpunData(
                    roomId = roomId,
                    index = spin.index,
                    result = spin.result,
                    entryCount = spin.entryCount,
                    spunAt = spin.spunAt,
                    senderId = spin.senderId,
                    entries = wheelState.entries
                )
            },
            isConnected = connectionState == ConnectionState.CONNECTED,
            onEntryInputChange = { text -> viewModel.updateWheelEntryInput(text) },
            onAddEntry = { viewModel.addWheelEntry() },
            onRemoveEntry = { index -> viewModel.removeWheelEntry(index) },
            onClearAll = { viewModel.clearWheelEntries() },
            onSpin = { viewModel.spinWheel() },
            onDismiss = { viewModel.closeWheelPicker() }
        )
    }
    
    PlaylistPanel(
        playlists = playlistState.playlists,
        activePlaylistId = playlistState.activePlaylistId,
        currentItemIndex = playlistState.currentItemIndex,
        currentVideoUrl = videoUrl,
        isOpen = showPlaylistPanel,
        onClose = { viewModel.closePlaylistPanel() },
        onCreatePlaylist = { name, description -> viewModel.createPlaylist(name, description) },
        onUpdatePlaylist = { playlistId, name, description, settings -> 
            viewModel.updatePlaylist(playlistId, name, description, settings) 
        },
        onDeletePlaylist = { playlistId -> viewModel.deletePlaylist(playlistId) },
        onAddItem = { playlistId, videoUrl, title, duration, thumbnail -> 
            viewModel.addPlaylistItem(playlistId, videoUrl, title, duration, thumbnail) 
        },
        onRemoveItem = { playlistId, itemId -> viewModel.removePlaylistItem(playlistId, itemId) },
        onSetActive = { playlistId -> viewModel.setActivePlaylist(playlistId) },
        onPlayItem = { playlistId, itemId -> viewModel.playPlaylistItem(playlistId, itemId) },
        onPlayNext = { viewModel.playNextInPlaylist() },
        onPlayPrevious = { viewModel.playPreviousInPlaylist() }
    )
}

// --- TAB CONTENTS ---

@Composable
private fun VideoTabContent(
    videoUrl: String,
    onVideoUrlChange: (String) -> Unit,
    onLoadVideo: () -> Unit,
    roomState: RoomUiState,
    viewModel: RoomViewModel,
    chatMessages: List<ChatMessage>,
    chatInput: String,
    onChatInputChange: (String) -> Unit,
    onSendChat: () -> Unit,
    modifier: Modifier = Modifier,
    isTV: Boolean = false,
    onEnterFullscreen: () -> Unit = {},
    isFullscreen: Boolean = false,
    isTheatreMode: Boolean = false,
    onToggleTheatreMode: () -> Unit = {}
) {
    var isChatExpanded by remember { mutableStateOf(false) }
    var showYouTubeBrowser by remember { mutableStateOf(false) }
    var browseSource by remember { mutableStateOf(InAppVideoSource.YOUTUBE) }
    var showSourceMenu by remember { mutableStateOf(false) }
    
    val padding = if (isTV) 24.dp else 16.dp
    val spacing = if (isTV) 28.dp else 20.dp

    Column(
        modifier = modifier.padding(padding),
        verticalArrangement = Arrangement.spacedBy(spacing)
    ) {
        // --- 1. Video URL Input (hidden in theatre mode) ---
        if (!isTheatreMode) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(if (isTV) 12.dp else 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (isTV) {
                TvTextField(
                    value = videoUrl,
                    onValueChange = onVideoUrlChange,
                    placeholder = "Paste video URL...",
                    modifier = Modifier.weight(1f)
                )
                TvPrimaryButton(
                    onClick = onLoadVideo,
                    enabled = videoUrl.isNotBlank()
                ) {
                    Text("Load", fontSize = 16.sp)
                }
            } else {
                OutlinedTextField(
                    value = videoUrl,
                    onValueChange = onVideoUrlChange,
                    placeholder = { Text("Paste video URL...", color = Color.Gray, fontSize = 14.sp) },
                    modifier = Modifier.weight(1f),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Color(0xFF3B82F6),
                        unfocusedBorderColor = Color(0xFF334155),
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White
                    ),
                    shape = RoundedCornerShape(12.dp),
                    singleLine = true,
                    textStyle = TextStyle(fontSize = 14.sp)
                )
                
                Button(
                    onClick = onLoadVideo,
                    enabled = videoUrl.isNotBlank(),
                    shape = RoundedCornerShape(12.dp),
                    contentPadding = PaddingValues(horizontal = 20.dp)
                ) {
                    Text("Load")
                }

                Box {
                    OutlinedButton(
                        onClick = { showSourceMenu = true },
                        shape = RoundedCornerShape(12.dp),
                        contentPadding = PaddingValues(horizontal = 12.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Search,
                            contentDescription = null
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Browse ${browseSource.displayName} (in-app)")
                    }

                    DropdownMenu(
                        expanded = showSourceMenu,
                        onDismissRequest = { showSourceMenu = false }
                    ) {
                        DropdownMenuItem(
                            text = { Text("YouTube") },
                            onClick = {
                                browseSource = InAppVideoSource.YOUTUBE
                                showSourceMenu = false
                                showYouTubeBrowser = true
                            }
                        )
                        DropdownMenuItem(
                            text = { Text("Twitch") },
                            onClick = {
                                browseSource = InAppVideoSource.TWITCH
                                showSourceMenu = false
                                showYouTubeBrowser = true
                            }
                        )
                        DropdownMenuItem(
                            text = { Text("Kick") },
                            onClick = {
                                browseSource = InAppVideoSource.KICK
                                showSourceMenu = false
                                showYouTubeBrowser = true
                            }
                        )
                        DropdownMenuItem(
                            text = { Text("Netflix") },
                            onClick = {
                                browseSource = InAppVideoSource.NETFLIX
                                showSourceMenu = false
                                showYouTubeBrowser = true
                            }
                        )
                    }
                }
            }
        }
        } // end !isTheatreMode URL input

        // --- 2. Video Player ---
        GlassCard {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(16f / 9f)
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color.Black),
                contentAlignment = Alignment.Center
            ) {
                if (showYouTubeBrowser) {
                    InAppVideoBrowserDialog(
                        source = browseSource,
                        onDismiss = { showYouTubeBrowser = false },
                        onSelectUrl = { url ->
                            onVideoUrlChange(url)
                            onLoadVideo()
                            showYouTubeBrowser = false
                        }
                    )
                }

                val effectiveVolume = roomState.videoState.localVolumeOverride ?: roomState.videoState.volume
                val effectiveMuted = roomState.videoState.localMutedOverride ?: roomState.videoState.isMuted

                if (roomState.videoState.url.isNotEmpty()) {
                    VideoPlayerView(
                        url = roomState.videoState.url,
                        // Pause main player when fullscreen is active to avoid dual playback
                        isPlaying = roomState.videoState.isPlaying && !isFullscreen,
                        currentTime = roomState.videoState.currentTime,
                        volume = effectiveVolume,
                        isMuted = effectiveMuted,
                        playbackSpeed = roomState.videoState.playbackSpeed,
                        onPlay = { viewModel.onPlay(roomState.videoState.currentTime) },
                        onPause = { viewModel.onPause(roomState.videoState.currentTime) },
                        onSeek = { time -> viewModel.onSeek(time) },
                        onProgress = { currentTime, duration ->
                            // Skip local progress updates if a remote sync was received recently
                            // This prevents the local playback position from overwriting the sync position
                            val timeSinceSync = System.currentTimeMillis() - roomState.videoState.lastRemoteSyncAt
                            // Only update progress when not in fullscreen and sync cooldown passed
                            if (!isFullscreen && timeSinceSync > 1500) {
                                viewModel.updateVideoState { it.copy(currentTime = currentTime, duration = duration) }
                            } else if (!isFullscreen) {
                                // Still update duration but not currentTime during sync cooldown
                                viewModel.updateVideoState { it.copy(duration = duration) }
                            }
                        },
                        onReady = {
                            viewModel.updateVideoState { it.copy(isReady = true) }
                        },
                        onError = { error ->
                            viewModel.updateVideoState { it.copy(error = error) }
                        },
                        modifier = Modifier.fillMaxSize(),
                        lastRemoteSyncAt = roomState.videoState.lastRemoteSyncAt,
                        onUrlChange = { newUrl ->
                            // When user selects content in Netflix, sync it to the room
                            viewModel.updateVideoUrl(newUrl)
                            viewModel.loadVideo()
                        },
                        onBuffering = { buffering ->
                            viewModel.updateVideoState { it.copy(isBuffering = buffering) }
                        },
                        onAutoPause = { position ->
                            viewModel.onPause(position)
                        }
                    )

                    // Buffering spinner overlay (centered) — visible whenever the
                    // ExoPlayer is rebuffering, which is when the user actually
                    // wants feedback that the video is loading.
                    if (roomState.videoState.isBuffering) {
                        CircularProgressIndicator(
                            modifier = Modifier
                                .align(Alignment.Center)
                                .size(48.dp),
                            color = Color.White,
                            strokeWidth = 3.dp
                        )
                    }

                    // Top-right overlay buttons: theatre toggle + fullscreen
                    Row(
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .padding(8.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        // Theatre mode toggle
                        IconButton(
                            onClick = onToggleTheatreMode,
                            modifier = Modifier
                                .size(36.dp)
                                .background(
                                    if (isTheatreMode) Color(0xFF6366F1).copy(alpha = 0.8f)
                                    else Color.Black.copy(alpha = 0.5f),
                                    CircleShape
                                )
                        ) {
                            Icon(
                                imageVector = if (isTheatreMode) Icons.Default.UnfoldLess else Icons.Default.UnfoldMore,
                                contentDescription = if (isTheatreMode) "Exit theatre mode" else "Theatre mode",
                                tint = Color.White,
                                modifier = Modifier.size(20.dp)
                            )
                        }

                        // Fullscreen button
                        IconButton(
                            onClick = onEnterFullscreen,
                            modifier = Modifier
                                .size(36.dp)
                                .background(Color.Black.copy(alpha = 0.5f), CircleShape)
                        ) {
                            Icon(
                                Icons.Default.Fullscreen,
                                contentDescription = "Enter fullscreen (with webcams)",
                                tint = Color.White,
                                modifier = Modifier.size(22.dp)
                            )
                        }
                    }
                } else {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Default.PlayCircleOutline, contentDescription = null, tint = Color.Gray, modifier = Modifier.size(48.dp))
                        Text("No video loaded", color = Color.Gray, fontSize = 12.sp)
                    }
                }
            }
        }

        // --- 3. Video Controls ---
        GlassCard {
            val effectiveVolume = roomState.videoState.localVolumeOverride ?: roomState.videoState.volume
            val effectiveMuted = roomState.videoState.localMutedOverride ?: roomState.videoState.isMuted

            VideoControlsBar(
                url = roomState.videoState.url,
                isPlaying = roomState.videoState.isPlaying,
                currentTime = roomState.videoState.currentTime,
                duration = roomState.videoState.duration,
                volume = effectiveVolume,
                isMuted = effectiveMuted,
                playbackSpeed = roomState.videoState.playbackSpeed,
                isBuffering = roomState.videoState.isBuffering,
                audioSyncEnabled = roomState.audioSyncEnabled,
                onPlay = { viewModel.onPlay(roomState.videoState.currentTime) },
                onPause = { viewModel.onPause(roomState.videoState.currentTime) },
                onSeek = { time -> viewModel.onSeek(time) },
                onMuteToggle = {
                    viewModel.setMuted(!effectiveMuted)
                },
                onVolumeChange = { newVolume ->
                    viewModel.setVolume(newVolume.coerceIn(0f, 1f))
                },
                onPlaybackSpeedChange = { newSpeed ->
                    viewModel.setPlaybackSpeed(newSpeed.coerceIn(0.25f, 2f))
                },
                onAudioSyncToggle = { enabled ->
                    viewModel.setAudioSyncEnabled(enabled)
                },
                onResync = { viewModel.requestResync() },
                modifier = Modifier.fillMaxWidth()
            )
        }

        // --- 4. NEW: Expandable Live Chat (hidden in theatre mode) ---
        // This is the "Modern, Hideable" Chat Section
        if (!isTheatreMode) {
        Surface(
            color = Color(0xFF1E293B).copy(alpha = 0.5f),
            shape = RoundedCornerShape(16.dp),
            border = BorderStroke(1.dp, Color(0xFF334155)),
            modifier = Modifier.animateContentSize() // Smooth expand/collapse animation
        ) {
            Column {
                // Header (Click to Toggle)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { isChatExpanded = !isChatExpanded }
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            "Live Chat",
                            style = TextStyle(color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                        )
                        // Live count badge
                        if (!isChatExpanded) {
                            Badge(containerColor = Color(0xFF3B82F6)) { 
                                Text("${chatMessages.size}", color = Color.White) 
                            }
                        }
                    }
                    Icon(
                        imageVector = if (isChatExpanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                        contentDescription = "Toggle Chat",
                        tint = Color(0xFF94A3B8)
                    )
                }

                // Expandable Content
                if (isChatExpanded) {
                    HorizontalDivider(color = Color(0xFF334155))
                    
                    Column(
                        modifier = Modifier
                            .height(300.dp) // Fixed height when open
                            .fillMaxWidth()
                    ) {
                        // Message List
                        LazyColumn(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp),
                            contentPadding = PaddingValues(vertical = 12.dp),
                            reverseLayout = true
                        ) {
                            items(chatMessages.reversed()) { msg ->
                                val isOwn = msg.senderId == roomState.userId
                                val senderLabel = if (isOwn) {
                                    "You"
                                } else {
                                    msg.senderUsername?.takeIf { it.isNotBlank() } ?: msg.senderId.take(8)
                                }
                                // Compact Message Item
                                Row(
                                    modifier = Modifier.padding(vertical = 4.dp),
                                    verticalAlignment = Alignment.Top
                                ) {
                                    Text(
                                        text = "$senderLabel: ",
                                        style = TextStyle(color = Color(0xFF3B82F6), fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                    )
                                    Text(
                                        text = msg.text,
                                        style = TextStyle(color = Color(0xFFE2E8F0), fontSize = 13.sp)
                                    )
                                }
                            }
                        }

                        // Mini Input Bar
                        Surface(color = Color(0xFF0F172A)) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                BasicTextField(
                                    value = chatInput,
                                    onValueChange = onChatInputChange,
                                    textStyle = TextStyle(color = Color.White, fontSize = 14.sp),
                                    modifier = Modifier
                                        .weight(1f)
                                        .background(Color(0xFF1E293B), RoundedCornerShape(20.dp))
                                        .padding(horizontal = 12.dp, vertical = 10.dp),
                                    singleLine = true,
                                    decorationBox = { innerTextField ->
                                        if (chatInput.isEmpty()) Text("Say something...", color = Color.Gray, fontSize = 14.sp)
                                        innerTextField()
                                    }
                                )
                                IconButton(
                                    onClick = onSendChat,
                                    modifier = Modifier.size(36.dp).background(Color(0xFF3B82F6), CircleShape)
                                ) {
                                    Icon(Icons.AutoMirrored.Filled.Send, null, tint = Color.White, modifier = Modifier.size(16.dp))
                                }
                            }
                        }
                    }
                }
            }
        }
        } // end !isTheatreMode chat

        // Bottom Spacer to prevent hitting the bottom bar
        Spacer(modifier = Modifier.height(24.dp))
    }
}

@Composable
private fun ControlsTabContent(
    viewModel: RoomViewModel,
    roomState: RoomUiState,
    isHost: Boolean,
    modifier: Modifier = Modifier,
    isTV: Boolean = false,
    onToggleMic: () -> Unit,
    onToggleCam: () -> Unit,
) {
    val padding = if (isTV) 24.dp else 16.dp
    val spacing = if (isTV) 20.dp else 16.dp
    val fontSize = if (isTV) 22.sp else 18.sp
    
    Column(
        modifier = modifier.padding(padding),
        verticalArrangement = Arrangement.spacedBy(spacing)
    ) {
        Text("Media Controls", color = Color.White, fontWeight = FontWeight.Bold, fontSize = fontSize)
        
        Row(horizontalArrangement = Arrangement.spacedBy(if (isTV) 16.dp else 12.dp)) {
            // Mic Toggle
            ControlTile(
                icon = if (roomState.localMediaState.mic) Icons.Default.Mic else Icons.Default.MicOff,
                label = "Mic",
                isActive = roomState.localMediaState.mic,
                onClick = onToggleMic,
                modifier = Modifier.weight(1f),
                isTV = isTV
            )
            // Cam Toggle
            ControlTile(
                icon = if (roomState.localMediaState.cam) Icons.Default.Videocam else Icons.Default.VideocamOff,
                label = "Camera",
                isActive = roomState.localMediaState.cam,
                onClick = onToggleCam,
                modifier = Modifier.weight(1f),
                isTV = isTV
            )
        }

        if (isHost) {
            Spacer(modifier = Modifier.height(spacing))
            Text("Host Controls", color = Color.White, fontWeight = FontWeight.Bold, fontSize = fontSize)
            if (isTV) {
                TvCard {
                    TvPrimaryButton(
                        onClick = { viewModel.setRoomPassword("") },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Reset Room Password", fontSize = 16.sp)
                    }
                }
            } else {
                GlassCard {
                    Button(
                        onClick = { viewModel.setRoomPassword("") },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Reset Room Password")
                    }
                }
            }
        }
    }
}

@Composable
private fun ControlTile(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    isActive: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    isTV: Boolean = false
) {
    val padding = if (isTV) 32.dp else 24.dp
    val iconSize = if (isTV) 40.dp else 32.dp
    val fontSize = if (isTV) 18.sp else 14.sp
    val cornerRadius = if (isTV) 16.dp else 12.dp
    
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(cornerRadius))
            .background(if (isActive) Color(0xFF3B82F6) else Color(0xFF334155))
            .clickable(onClick = onClick)
            .padding(vertical = padding),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(icon, null, tint = Color.White, modifier = Modifier.size(iconSize))
        Spacer(Modifier.height(if (isTV) 12.dp else 8.dp))
        Text(label, color = Color.White, fontSize = fontSize)
    }
}

@Composable
private fun ActivityTabContent(
    activityLog: List<ActivityLogEntry>,
    chatMessages: List<ChatMessage>,
    chatInput: String,
    onChatInputChange: (String) -> Unit,
    onSendChat: () -> Unit,
    localUserId: String,
    isTV: Boolean = false
) {
    val padding = if (isTV) 24.dp else 16.dp
    
    // This column takes up the full 'Box' weight from the parent
    Column(
        modifier = Modifier.fillMaxSize()
    ) {
        // 1. Chat List (Takes all available space)
        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            contentPadding = PaddingValues(vertical = 16.dp),
            reverseLayout = true // Chat starts from bottom
        ) {
            items(chatMessages.reversed()) { msg ->
                ChatMessageItem(msg, localUserId = localUserId)
                Spacer(modifier = Modifier.height(8.dp))
            }
            
            // Show activity log at the "top" (which is bottom of list in reverse layout)
            if (activityLog.isNotEmpty()) {
                item {
                    Text(
                        "Recent Activity",
                        color = Color(0xFF94A3B8),
                        fontSize = 12.sp,
                        modifier = Modifier.padding(vertical = 8.dp)
                    )
                }
                items(activityLog.takeLast(5).reversed()) { log ->
                    ActivityLogItem(log)
                }
            }
        }

        // 2. Input Area (Pinned to bottom of this tab)
        Surface(
            color = Color(0xFF1E293B),
            tonalElevation = 4.dp
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                TextField(
                    value = chatInput,
                    onValueChange = onChatInputChange,
                    placeholder = { Text("Type a message...", fontSize = 14.sp) },
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = 48.dp),
                    colors = TextFieldDefaults.colors(
                        focusedContainerColor = Color(0xFF0F172A),
                        unfocusedContainerColor = Color(0xFF0F172A),
                        focusedIndicatorColor = Color.Transparent,
                        unfocusedIndicatorColor = Color.Transparent,
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White
                    ),
                    shape = RoundedCornerShape(24.dp)
                )

                IconButton(
                    onClick = onSendChat,
                    enabled = chatInput.isNotBlank(),
                    modifier = Modifier
                        .size(48.dp)
                        .background(
                            if (chatInput.isNotBlank()) Color(0xFF3B82F6) else Color(0xFF334155),
                            CircleShape
                        )
                ) {
                    Icon(Icons.AutoMirrored.Filled.Send, "Send", tint = Color.White)
                }
            }
        }
    }
}

// --- LIST ITEMS ---

@Composable
private fun ChatMessageItem(
    msg: ChatMessage,
    localUserId: String
) {
    val isOwn = msg.senderId == localUserId
    val senderLabel = if (isOwn) {
        "You"
    } else {
        msg.senderUsername?.takeIf { it.isNotBlank() } ?: msg.senderId.take(10)
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp, bottomEnd = 12.dp))
            .background(Color(0xFF1E293B))
            .padding(12.dp)
    ) {
        Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
            Text(senderLabel, color = Color(0xFF3B82F6), fontWeight = FontWeight.Bold, fontSize = 12.sp)
            Text(msg.createdAt, color = Color(0xFF64748B), fontSize = 10.sp)
        }
        Spacer(Modifier.height(4.dp))
        Text(msg.text, color = Color(0xFFE2E8F0), fontSize = 14.sp)
    }
}

@Composable
private fun ActivityLogItem(entry: ActivityLogEntry) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = Icons.Default.Info,
            contentDescription = null,
            tint = Color(0xFF64748B),
            modifier = Modifier.size(12.dp)
        )
        Spacer(Modifier.width(8.dp))
        Text(entry.message, color = Color(0xFF64748B), fontSize = 12.sp)
    }
}

@Composable
private fun BottomMediaBar(
    micEnabled: Boolean,
    camEnabled: Boolean,
    participants: List<Participant>,
    onToggleMic: () -> Unit,
    onToggleCam: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFF0F172A)) // Slate 950
            .navigationBarsPadding() // Adds padding for Android gesture bar
    ) {
        // 1. Sleek top separator line instead of a full border
        HorizontalDivider(
            thickness = 1.dp,
            color = Color(0xFF1E293B) // Slate 800
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Left: Status Indicators (Pills)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                MediaStatusChip(
                    icon = if (micEnabled) Icons.Default.Mic else Icons.Default.MicOff,
                    label = if (micEnabled) "Mic on" else "Mic off",
                    isActive = micEnabled,
                    onClick = onToggleMic,
                )
                MediaStatusChip(
                    icon = if (camEnabled) Icons.Default.Videocam else Icons.Default.VideocamOff,
                    label = if (camEnabled) "Cam on" else "Cam off",
                    isActive = camEnabled,
                    onClick = onToggleCam,
                )
            }

            // Right: Participant Count
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .background(Color(0xFF22C55E), CircleShape) // Green dot
                )
                Text(
                    text = "${participants.size} Online",
                    style = TextStyle(
                        color = Color(0xFF94A3B8), // Slate 400
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium
                    )
                )
            }
        }
    }
}

// New Helper Component for better visuals
@Composable
private fun MediaStatusChip(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    isActive: Boolean,
    onClick: () -> Unit,
) {
    Surface(
        onClick = onClick,
        color = if (isActive) Color(0xFF1E293B) else Color(0xFF0F172A),
        shape = RoundedCornerShape(50), // Fully rounded pill
        border = BorderStroke(
            width = 1.dp, 
            color = if (isActive) Color(0xFF22C55E) else Color(0xFF334155)
        )
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (isActive) Color(0xFF22C55E) else Color(0xFF64748B),
                modifier = Modifier.size(14.dp)
            )
            Text(
                text = label,
                style = TextStyle(
                    color = if (isActive) Color(0xFFE2E8F0) else Color(0xFF64748B),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium
                )
            )
        }
    }
}

@Composable
private fun GlassCard(content: @Composable () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = Color(0xFF1E293B).copy(alpha = 0.5f),
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(1.dp, Color(0xFF334155)),
        content = content
    )
}
