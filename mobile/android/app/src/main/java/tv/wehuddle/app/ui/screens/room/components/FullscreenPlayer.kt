package tv.wehuddle.app.ui.screens.room.components

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.view.WindowManager
import androidx.activity.compose.BackHandler
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import org.webrtc.EglBase
import org.webrtc.MediaStream
import tv.wehuddle.app.data.model.ChatMessage
import tv.wehuddle.app.data.model.WebRTCMediaState
import tv.wehuddle.app.ui.components.LocalVideoTile
import tv.wehuddle.app.ui.components.RemoteVideoTile
import tv.wehuddle.app.ui.components.VideoPlayerView
import kotlin.math.roundToInt

/**
 * Position preset for webcam overlay in fullscreen mode
 */
enum class WebcamPosition(val displayName: String) {
    TOP_LEFT("Top Left"),
    TOP_RIGHT("Top Right"),
    TOP_CENTER("Top Center"),
    BOTTOM_LEFT("Bottom Left"),
    BOTTOM_RIGHT("Bottom Right"),
    BOTTOM_CENTER("Bottom Center");

    companion object {
        fun fromOrdinal(ordinal: Int): WebcamPosition = entries.getOrElse(ordinal) { TOP_RIGHT }
    }
}

/**
 * Size preset for webcam overlay
 */
enum class WebcamSize(val displayName: String, val width: Int, val height: Int) {
    SMALL("Small", 100, 75),
    MEDIUM("Medium", 140, 105),
    LARGE("Large", 180, 135);

    companion object {
        fun fromOrdinal(ordinal: Int): WebcamSize = entries.getOrElse(ordinal) { MEDIUM }
    }
}

/**
 * Data class representing a remote stream with its media state
 */
data class RemoteStreamInfo(
    val peerId: String,
    val stream: MediaStream?,
    val mediaState: WebRTCMediaState?,
    val username: String
)

/**
 * Fullscreen video player with webcam overlay and chat
 */
@Composable
fun FullscreenPlayerOverlay(
    isFullscreen: Boolean,
    onExitFullscreen: () -> Unit,
    // Video state
    videoUrl: String,
    isPlaying: Boolean,
    currentTime: Double,
    duration: Double,
    volume: Float,
    isMuted: Boolean,
    playbackSpeed: Float,
    // Video controls
    onPlay: () -> Unit,
    onPause: () -> Unit,
    onSeek: (Double) -> Unit,
    onProgress: (Double, Double) -> Unit,
    onReady: () -> Unit,
    onError: (String) -> Unit,
    // WebRTC state
    eglContext: EglBase.Context?,
    localStream: MediaStream?,
    localMediaState: WebRTCMediaState,
    remoteStreams: List<RemoteStreamInfo>,
    localUsername: String,
    onToggleMic: () -> Unit,
    onToggleCam: () -> Unit,
    // Chat state
    chatMessages: List<ChatMessage>,
    chatInput: String,
    currentUserId: String,
    onChatInputChange: (String) -> Unit,
    onSendChat: () -> Unit,
    // Settings
    webcamPosition: WebcamPosition,
    webcamSize: WebcamSize,
    showWebcams: Boolean,
    showChat: Boolean,
    onWebcamPositionChange: (WebcamPosition) -> Unit,
    onWebcamSizeChange: (WebcamSize) -> Unit,
    onShowWebcamsChange: (Boolean) -> Unit,
    onShowChatChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    var showControls by remember { mutableStateOf(true) }
    var showSettings by remember { mutableStateOf(false) }
    
    // Fullscreen player maintains its own time state - initialized from currentTime
    // but NOT updated when currentTime prop changes (to avoid seek thrashing)
    var fullscreenCurrentTime by remember(isFullscreen) { mutableStateOf(currentTime) }
    var fullscreenDuration by remember(isFullscreen) { mutableStateOf(duration) }
    
    // Auto-hide controls after 3 seconds
    LaunchedEffect(showControls, isPlaying) {
        if (showControls && isPlaying) {
            delay(3000)
            showControls = false
        }
    }
    
    // Handle immersive mode
    DisposableEffect(isFullscreen) {
        val activity = context.findActivity()
        if (isFullscreen && activity != null) {
            activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
        onDispose {
            activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }
    
    // Handle back button to exit fullscreen instead of navigating away
    BackHandler(enabled = isFullscreen) {
        onExitFullscreen()
    }

    AnimatedVisibility(
        visible = isFullscreen,
        enter = fadeIn() + scaleIn(initialScale = 0.9f),
        exit = fadeOut() + scaleOut(targetScale = 0.9f)
    ) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .background(Color.Black)
        ) {
            // Video Player - Full screen
            if (videoUrl.isNotEmpty()) {
                VideoPlayerView(
                    url = videoUrl,
                    isPlaying = isPlaying,
                    // Use fullscreen's own time state, not the prop
                    currentTime = fullscreenCurrentTime,
                    volume = volume,
                    isMuted = isMuted,
                    playbackSpeed = playbackSpeed,
                    onPlay = onPlay,
                    onPause = onPause,
                    onSeek = { time -> 
                        fullscreenCurrentTime = time
                        onSeek(time)
                    },
                    onProgress = { currentTime, duration ->
                        // Update fullscreen's own state
                        fullscreenCurrentTime = currentTime
                        fullscreenDuration = duration
                        // Don't call onProgress - we don't want to update shared state
                    },
                    onReady = onReady,
                    onError = onError,
                    modifier = Modifier.fillMaxSize()
                )
            } else {
                // No video placeholder
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            Icons.Default.PlayCircleOutline,
                            contentDescription = null,
                            tint = Color.Gray,
                            modifier = Modifier.size(80.dp)
                        )
                        Spacer(Modifier.height(16.dp))
                        Text("No video loaded", color = Color.Gray, fontSize = 18.sp)
                    }
                }
            }
            
            // INVISIBLE TOUCH INTERCEPTOR - prevents YouTube WebView from capturing touches
            // This layer sits on top of the video and intercepts all touch events
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .pointerInput(Unit) {
                        detectTapGestures(
                            onTap = { showControls = !showControls },
                            onDoubleTap = {
                                // Double tap to play/pause
                                if (isPlaying) onPause() else onPlay()
                            }
                        )
                    }
            )

            // Webcam Overlay
            if (showWebcams) {
                WebcamOverlay(
                    eglContext = eglContext,
                    localStream = localStream,
                    localMediaState = localMediaState,
                    remoteStreams = remoteStreams,
                    localUsername = localUsername,
                    position = webcamPosition,
                    size = webcamSize,
                    onToggleMic = onToggleMic,
                    onToggleCam = onToggleCam
                )
            }

            // Chat Overlay (slide from right)
            AnimatedVisibility(
                visible = showChat,
                modifier = Modifier.align(Alignment.CenterEnd),
                enter = slideInHorizontally { it },
                exit = slideOutHorizontally { it }
            ) {
                FullscreenChatPanel(
                    chatMessages = chatMessages,
                    chatInput = chatInput,
                    currentUserId = currentUserId,
                    onChatInputChange = onChatInputChange,
                    onSendChat = onSendChat,
                    onClose = { onShowChatChange(false) }
                )
            }

            // Controls overlay
            AnimatedVisibility(
                visible = showControls,
                enter = fadeIn(),
                exit = fadeOut()
            ) {
                Box(modifier = Modifier.fillMaxSize()) {
                    // Top bar
                    FullscreenTopBar(
                        onExitFullscreen = onExitFullscreen,
                        onSettings = { showSettings = true },
                        modifier = Modifier.align(Alignment.TopCenter)
                    )

                    // Center play/pause
                    CenterPlayButton(
                        isPlaying = isPlaying,
                        onPlay = onPlay,
                        onPause = onPause,
                        modifier = Modifier.align(Alignment.Center)
                    )

                    // Bottom controls
                    FullscreenBottomControls(
                        currentTime = fullscreenCurrentTime,
                        duration = fullscreenDuration,
                        isPlaying = isPlaying,
                        isMuted = isMuted,
                        showChat = showChat,
                        showWebcams = showWebcams,
                        onPlay = onPlay,
                        onPause = onPause,
                        onSeek = { time -> 
                            fullscreenCurrentTime = time
                            onSeek(time)
                        },
                        onMuteToggle = { /* toggle mute handled externally */ },
                        onChatToggle = { onShowChatChange(!showChat) },
                        onWebcamToggle = { onShowWebcamsChange(!showWebcams) },
                        chatUnread = chatMessages.isNotEmpty(),
                        modifier = Modifier.align(Alignment.BottomCenter)
                    )
                }
            }

            // Settings dialog
            if (showSettings) {
                FullscreenSettingsDialog(
                    webcamPosition = webcamPosition,
                    webcamSize = webcamSize,
                    showWebcams = showWebcams,
                    showChat = showChat,
                    onWebcamPositionChange = onWebcamPositionChange,
                    onWebcamSizeChange = onWebcamSizeChange,
                    onShowWebcamsChange = onShowWebcamsChange,
                    onShowChatChange = onShowChatChange,
                    onDismiss = { showSettings = false }
                )
            }
        }
    }
}

@Composable
private fun WebcamOverlay(
    eglContext: EglBase.Context?,
    localStream: MediaStream?,
    localMediaState: WebRTCMediaState,
    remoteStreams: List<RemoteStreamInfo>,
    localUsername: String,
    position: WebcamPosition,
    size: WebcamSize,
    onToggleMic: () -> Unit,
    onToggleCam: () -> Unit
) {
    val hasLocalCam = localMediaState.cam && localStream != null
    
    // Show remote participants who have camera on AND have an actual video stream
    // Only show thumbnails if the WebRTC stream is established, otherwise it will display as placeholder
    val remotesWithCam = remoteStreams.filter { remote ->
        val hasStream = remote.stream != null
        val hasVideoTrack = remote.stream?.videoTracks?.firstOrNull()?.enabled() == true
        val hasMediaStateCamOn = remote.mediaState?.cam == true
        // Require: stream exists AND (camera on OR video track enabled)
        hasStream && (hasMediaStateCamOn || hasVideoTrack)
    }
    
    if (!hasLocalCam && remotesWithCam.isEmpty()) return

    // Calculate alignment based on position
    val alignment = when (position) {
        WebcamPosition.TOP_LEFT -> Alignment.TopStart
        WebcamPosition.TOP_RIGHT -> Alignment.TopEnd
        WebcamPosition.TOP_CENTER -> Alignment.TopCenter
        WebcamPosition.BOTTOM_LEFT -> Alignment.BottomStart
        WebcamPosition.BOTTOM_RIGHT -> Alignment.BottomEnd
        WebcamPosition.BOTTOM_CENTER -> Alignment.BottomCenter
    }

    // Horizontal arrangement for cams
    val isTop = position in listOf(WebcamPosition.TOP_LEFT, WebcamPosition.TOP_CENTER, WebcamPosition.TOP_RIGHT)
    val isLeft = position in listOf(WebcamPosition.TOP_LEFT, WebcamPosition.BOTTOM_LEFT)
    val isCenter = position in listOf(WebcamPosition.TOP_CENTER, WebcamPosition.BOTTOM_CENTER)

    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        // Container for webcam thumbnails
        Surface(
            modifier = Modifier.align(alignment),
            color = Color.Black.copy(alpha = 0.3f),
            shape = RoundedCornerShape(16.dp)
        ) {
            LazyRow(
                modifier = Modifier.padding(8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                reverseLayout = !isLeft && !isCenter
            ) {
                // Local camera
                if (hasLocalCam) {
                    item {
                        WebcamThumbnail(
                            eglContext = eglContext,
                            stream = localStream,
                            mediaState = localMediaState,
                            username = localUsername,
                            isLocal = true,
                            size = size,
                            onToggleMic = onToggleMic,
                            onToggleCam = onToggleCam
                        )
                    }
                }

                // Remote cameras
                items(remotesWithCam) { remote ->
                    WebcamThumbnail(
                        eglContext = eglContext,
                        stream = remote.stream,
                        mediaState = remote.mediaState,
                        username = remote.username,
                        isLocal = false,
                        size = size
                    )
                }
            }
        }
    }
}

@Composable
private fun WebcamThumbnail(
    eglContext: EglBase.Context?,
    stream: MediaStream?,
    mediaState: WebRTCMediaState?,
    username: String,
    isLocal: Boolean,
    size: WebcamSize,
    onToggleMic: (() -> Unit)? = null,
    onToggleCam: (() -> Unit)? = null
) {
    Box(
        modifier = Modifier
            .width(size.width.dp)
            .height(size.height.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(Color(0xFF1E293B))
    ) {
        if (isLocal && mediaState != null && stream != null) {
            LocalVideoTile(
                modifier = Modifier.fillMaxSize(),
                eglContext = eglContext,
                stream = stream,
                mediaState = mediaState,
                username = username,
                onToggleMic = onToggleMic ?: {},
                onToggleCamera = onToggleCam ?: {}
            )
        } else if (!isLocal && stream != null) {
            RemoteVideoTile(
                modifier = Modifier.fillMaxSize(),
                eglContext = eglContext,
                stream = stream,
                username = username,
                mediaState = mediaState
            )
        } else {
            // Placeholder
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        Icons.Default.Person,
                        contentDescription = null,
                        tint = Color.Gray,
                        modifier = Modifier.size(24.dp)
                    )
                    Text(
                        username.take(8),
                        color = Color.Gray,
                        fontSize = 10.sp
                    )
                }
            }
        }

        // Username label
        Surface(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(4.dp),
            color = Color.Black.copy(alpha = 0.6f),
            shape = RoundedCornerShape(4.dp)
        ) {
            Text(
                text = if (isLocal) "You" else username.take(8),
                color = Color.White,
                fontSize = 9.sp,
                modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp)
            )
        }

        // Mic indicator for remote users
        if (!isLocal && mediaState?.mic == false) {
            Surface(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(4.dp),
                color = Color(0xFFEF4444).copy(alpha = 0.9f),
                shape = CircleShape
            ) {
                Icon(
                    Icons.Default.MicOff,
                    contentDescription = "Muted",
                    tint = Color.White,
                    modifier = Modifier
                        .size(16.dp)
                        .padding(2.dp)
                )
            }
        }
    }
}

@Composable
private fun FullscreenTopBar(
    onExitFullscreen: () -> Unit,
    onSettings: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = Color.Black.copy(alpha = 0.5f)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp)
                .statusBarsPadding(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onExitFullscreen) {
                Icon(
                    Icons.Default.FullscreenExit,
                    contentDescription = "Exit fullscreen",
                    tint = Color.White,
                    modifier = Modifier.size(28.dp)
                )
            }

            Text(
                "🍿 Huddle",
                color = Color.White,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold
            )

            IconButton(onClick = onSettings) {
                Icon(
                    Icons.Default.Settings,
                    contentDescription = "Settings",
                    tint = Color.White,
                    modifier = Modifier.size(24.dp)
                )
            }
        }
    }
}

@Composable
private fun CenterPlayButton(
    isPlaying: Boolean,
    onPlay: () -> Unit,
    onPause: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier
            .size(72.dp)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null
            ) { if (isPlaying) onPause() else onPlay() },
        color = Color.Black.copy(alpha = 0.5f),
        shape = CircleShape
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(
                imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                contentDescription = if (isPlaying) "Pause" else "Play",
                tint = Color.White,
                modifier = Modifier.size(40.dp)
            )
        }
    }
}

@Composable
private fun FullscreenBottomControls(
    currentTime: Double,
    duration: Double,
    isPlaying: Boolean,
    isMuted: Boolean,
    showChat: Boolean,
    showWebcams: Boolean,
    onPlay: () -> Unit,
    onPause: () -> Unit,
    onSeek: (Double) -> Unit,
    onMuteToggle: () -> Unit,
    onChatToggle: () -> Unit,
    onWebcamToggle: () -> Unit,
    chatUnread: Boolean,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = Color.Black.copy(alpha = 0.5f)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 8.dp)
        ) {
            // Progress bar
            val progress = if (duration > 0) (currentTime / duration).toFloat().coerceIn(0f, 1f) else 0f
            Slider(
                value = progress,
                onValueChange = { newProgress ->
                    onSeek(newProgress.toDouble() * duration)
                },
                colors = SliderDefaults.colors(
                    thumbColor = Color(0xFF3B82F6),
                    activeTrackColor = Color(0xFF3B82F6),
                    inactiveTrackColor = Color.White.copy(alpha = 0.3f)
                ),
                modifier = Modifier.fillMaxWidth()
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Left - Time
                Text(
                    "${formatTime(currentTime)} / ${formatTime(duration)}",
                    color = Color.White,
                    fontSize = 14.sp
                )

                // Center - Main controls
                Row(
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = { onSeek(maxOf(0.0, currentTime - 10.0)) }) {
                        Icon(Icons.Default.Replay10, "Rewind 10s", tint = Color.White)
                    }

                    IconButton(onClick = if (isPlaying) onPause else onPlay) {
                        Icon(
                            if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                            if (isPlaying) "Pause" else "Play",
                            tint = Color.White,
                            modifier = Modifier.size(32.dp)
                        )
                    }

                    IconButton(onClick = { onSeek(currentTime + 10.0) }) {
                        Icon(Icons.Default.Forward10, "Forward 10s", tint = Color.White)
                    }
                }

                // Right - Additional controls
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Webcam toggle
                    IconButton(onClick = onWebcamToggle) {
                        Icon(
                            if (showWebcams) Icons.Default.Videocam else Icons.Default.VideocamOff,
                            "Toggle webcams",
                            tint = if (showWebcams) Color(0xFF3B82F6) else Color.White
                        )
                    }

                    // Chat toggle
                    Box {
                        IconButton(onClick = onChatToggle) {
                            Icon(
                                Icons.AutoMirrored.Filled.Chat,
                                "Toggle chat",
                                tint = if (showChat) Color(0xFF3B82F6) else Color.White
                            )
                        }
                        if (chatUnread && !showChat) {
                            Box(
                                modifier = Modifier
                                    .align(Alignment.TopEnd)
                                    .size(10.dp)
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
private fun FullscreenChatPanel(
    chatMessages: List<ChatMessage>,
    chatInput: String,
    currentUserId: String,
    onChatInputChange: (String) -> Unit,
    onSendChat: () -> Unit,
    onClose: () -> Unit
) {
    Surface(
        modifier = Modifier
            .width(320.dp)
            .fillMaxHeight(),
        color = Color(0xFF0F172A).copy(alpha = 0.95f),
        shape = RoundedCornerShape(topStart = 16.dp, bottomStart = 16.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
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
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold
                )
                IconButton(
                    onClick = onClose,
                    modifier = Modifier.size(32.dp)
                ) {
                    Icon(Icons.Default.Close, "Close", tint = Color.White)
                }
            }

            Spacer(Modifier.height(12.dp))

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
                        Column(modifier = Modifier.padding(10.dp)) {
                            Text(
                                senderLabel,
                                color = if (isOwn) Color(0xFF60A5FA) else Color(0xFF94A3B8),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                            Spacer(Modifier.height(4.dp))
                            Text(
                                msg.text,
                                color = Color(0xFFE2E8F0),
                                fontSize = 13.sp
                            )
                        }
                    }
                }

                if (chatMessages.isEmpty()) {
                    item {
                        Box(
                            modifier = Modifier.fillMaxWidth(),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                "No messages yet",
                                color = Color(0xFF64748B),
                                fontSize = 14.sp
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.height(12.dp))

            // Input
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
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
                        if (chatInput.isEmpty()) {
                            Text("Message...", color = Color.Gray, fontSize = 14.sp)
                        }
                        innerTextField()
                    }
                )
                IconButton(
                    onClick = onSendChat,
                    enabled = chatInput.isNotBlank(),
                    modifier = Modifier
                        .size(40.dp)
                        .background(
                            if (chatInput.isNotBlank()) Color(0xFF3B82F6) else Color(0xFF334155),
                            CircleShape
                        )
                ) {
                    Icon(
                        Icons.AutoMirrored.Filled.Send,
                        "Send",
                        tint = Color.White,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FullscreenSettingsDialog(
    webcamPosition: WebcamPosition,
    webcamSize: WebcamSize,
    showWebcams: Boolean,
    showChat: Boolean,
    onWebcamPositionChange: (WebcamPosition) -> Unit,
    onWebcamSizeChange: (WebcamSize) -> Unit,
    onShowWebcamsChange: (Boolean) -> Unit,
    onShowChatChange: (Boolean) -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Color(0xFF1E293B),
        titleContentColor = Color.White,
        textContentColor = Color(0xFFCBD5E1),
        title = {
            Text("Fullscreen Settings", fontWeight = FontWeight.Bold)
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(20.dp)) {
                // Show webcams toggle
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Show Webcams", color = Color.White)
                    Switch(
                        checked = showWebcams,
                        onCheckedChange = onShowWebcamsChange,
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = Color.White,
                            checkedTrackColor = Color(0xFF3B82F6)
                        )
                    )
                }

                // Webcam position
                if (showWebcams) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Webcam Position", color = Color.White, fontWeight = FontWeight.Medium)
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            items(WebcamPosition.entries) { pos ->
                                FilterChip(
                                    selected = webcamPosition == pos,
                                    onClick = { onWebcamPositionChange(pos) },
                                    label = { Text(pos.displayName, fontSize = 12.sp) },
                                    colors = FilterChipDefaults.filterChipColors(
                                        selectedContainerColor = Color(0xFF3B82F6),
                                        selectedLabelColor = Color.White
                                    )
                                )
                            }
                        }
                    }

                    // Webcam size
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Webcam Size", color = Color.White, fontWeight = FontWeight.Medium)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            WebcamSize.entries.forEach { sizeOption ->
                                FilterChip(
                                    selected = webcamSize == sizeOption,
                                    onClick = { onWebcamSizeChange(sizeOption) },
                                    label = { Text(sizeOption.displayName) },
                                    colors = FilterChipDefaults.filterChipColors(
                                        selectedContainerColor = Color(0xFF3B82F6),
                                        selectedLabelColor = Color.White
                                    )
                                )
                            }
                        }
                    }
                }

                // Show chat toggle
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Show Chat in Fullscreen", color = Color.White)
                    Switch(
                        checked = showChat,
                        onCheckedChange = onShowChatChange,
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = Color.White,
                            checkedTrackColor = Color(0xFF3B82F6)
                        )
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("Done", color = Color(0xFF3B82F6))
            }
        }
    )
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

private fun Context.findActivity(): Activity? {
    var context = this
    while (context is ContextWrapper) {
        if (context is Activity) return context
        context = context.baseContext
    }
    return null
}
