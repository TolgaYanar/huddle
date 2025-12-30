package tv.wehuddle.app.ui.components

import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import tv.wehuddle.app.data.model.*
import tv.wehuddle.app.ui.theme.*

/**
 * Video player component using ExoPlayer
 */
@OptIn(UnstableApi::class)
@Composable
fun VideoPlayerView(
    url: String,
    isPlaying: Boolean,
    currentTime: Double,
    volume: Float,
    isMuted: Boolean,
    playbackSpeed: Float,
    onPlay: () -> Unit,
    onPause: () -> Unit,
    onSeek: (Double) -> Unit,
    onProgress: (Double, Double) -> Unit,
    onReady: () -> Unit,
    onError: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val platform = remember(url) { detectPlatform(url) }
    
    // ExoPlayer for direct video URLs - recreate when URL changes
    val exoPlayer = remember(url) {
        ExoPlayer.Builder(context).build().apply {
            playWhenReady = false
        }
    }
    
    // Cleanup on disposal
    DisposableEffect(exoPlayer) {
        onDispose {
            exoPlayer.release()
        }
    }
    
    // Update media item when URL changes
    LaunchedEffect(url, platform) {
        if (url.isNotBlank() && (platform == PlatformType.DIRECT || platform == PlatformType.UNKNOWN)) {
            try {
                val mediaItem = MediaItem.fromUri(url)
                exoPlayer.clearMediaItems()
                exoPlayer.setMediaItem(mediaItem)
                exoPlayer.prepare()
            } catch (e: IllegalArgumentException) {
                onError("Invalid video URL: ${e.message}")
            } catch (e: Exception) {
                val errorMsg = e.message ?: "Failed to load video: ${e::class.simpleName}"
                onError(errorMsg)
            }
        }
    }
    
    // Handle play/pause
    LaunchedEffect(isPlaying) {
        try {
            exoPlayer.playWhenReady = isPlaying
        } catch (e: Exception) {
            onError("Play error: ${e.message}")
        }
    }
    
    // Handle seek
    LaunchedEffect(currentTime) {
        if (currentTime >= 0) {
            try {
                val targetMs = (currentTime * 1000).toLong()
                val diff = kotlin.math.abs(exoPlayer.currentPosition - targetMs)
                if (diff > 500) { // Only seek if difference > 500ms
                    exoPlayer.seekTo(targetMs)
                }
            } catch (e: Exception) {
                // Ignore seek errors
            }
        }
    }
    
    // Handle volume
    LaunchedEffect(volume, isMuted) {
        try {
            exoPlayer.volume = if (isMuted) 0f else volume.coerceIn(0f, 1f)
        } catch (e: Exception) {
            // Ignore volume errors
        }
    }
    
    // Handle playback speed
    LaunchedEffect(playbackSpeed) {
        try {
            exoPlayer.setPlaybackSpeed(playbackSpeed.coerceIn(0.25f, 2f))
        } catch (e: Exception) {
            // Ignore speed errors
        }
    }
    
    // Listen to player events
    LaunchedEffect(exoPlayer) {
        val listener = object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                when (state) {
                    Player.STATE_READY -> {
                        val duration = exoPlayer.duration / 1000.0
                        if (duration > 0) {
                            onProgress(exoPlayer.currentPosition / 1000.0, duration)
                        }
                        onReady()
                    }
                    Player.STATE_ENDED -> {
                        onPause()
                    }
                }
            }
            
            override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                onError("Video error: ${error.message ?: error.errorCodeName}")
            }
        }
        
        exoPlayer.addListener(listener)
        
        try {
            // Report progress while playing
            while (true) {
                if (exoPlayer.playbackState == Player.STATE_READY && exoPlayer.isPlaying) {
                    val position = exoPlayer.currentPosition / 1000.0
                    val duration = exoPlayer.duration / 1000.0
                    if (duration > 0) {
                        onProgress(position, duration)
                    }
                }
                kotlinx.coroutines.delay(500)
            }
        } finally {
            exoPlayer.removeListener(listener)
        }
    }
    
    Box(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(16f / 9f)
            .clip(RoundedCornerShape(12.dp))
            .background(Slate900)
    ) {
        when {
            url.isBlank() -> {
                // Empty state
                Column(
                    modifier = Modifier.fillMaxSize(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.VideoLibrary,
                        contentDescription = null,
                        modifier = Modifier.size(48.dp),
                        tint = Slate500
                    )
                    Spacer(Modifier.height(16.dp))
                    Text(
                        text = "No video loaded",
                        style = TextStyle(
                            color = Slate400,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Medium
                        )
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = "Paste a URL above to start watching",
                        style = TextStyle(
                            color = Slate500,
                            fontSize = 14.sp
                        )
                    )
                }
            }
            
            platform == PlatformType.YOUTUBE -> {
                // YouTube player using WebView with IFrame API
                YouTubePlayerView(
                    url = url,
                    isPlaying = isPlaying,
                    currentTime = currentTime,
                    volume = volume,
                    isMuted = isMuted,
                    playbackSpeed = playbackSpeed,
                    onPlay = onPlay,
                    onPause = onPause,
                    onSeek = onSeek,
                    onProgress = onProgress,
                    onReady = onReady,
                    onError = onError,
                    modifier = Modifier.fillMaxSize()
                )
            }
            
            platform == PlatformType.TWITCH || platform == PlatformType.KICK -> {
                // Embed not supported placeholder
                EmbedNotSupportedPlaceholder(
                    platform = platform,
                    modifier = Modifier.fillMaxSize()
                )
            }
            
            else -> {
                // ExoPlayer view
                AndroidView(
                    factory = { ctx ->
                        PlayerView(ctx).apply {
                            player = exoPlayer
                            useController = false
                            layoutParams = FrameLayout.LayoutParams(
                                ViewGroup.LayoutParams.MATCH_PARENT,
                                ViewGroup.LayoutParams.MATCH_PARENT
                            )
                        }
                    },
                    modifier = Modifier.fillMaxSize()
                )
            }
        }
    }
}

@Composable
private fun EmbedNotSupportedPlaceholder(
    platform: PlatformType,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier.background(Slate900),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                imageVector = Icons.Default.Block,
                contentDescription = null,
                modifier = Modifier.size(48.dp),
                tint = Slate500
            )
            Spacer(Modifier.height(16.dp))
            Text(
                text = "${platform.name} videos",
                style = TextStyle(
                    color = Slate200,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Medium
                )
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = "Embed controls not available",
                style = TextStyle(
                    color = Slate400,
                    fontSize = 12.sp
                )
            )
        }
    }
}

/**
 * Video controls bar
 */
@Composable
fun VideoControlsBar(
    url: String,
    isPlaying: Boolean,
    currentTime: Double,
    duration: Double,
    volume: Float,
    isMuted: Boolean,
    playbackSpeed: Float,
    isBuffering: Boolean,
    onPlay: () -> Unit,
    onPause: () -> Unit,
    onSeek: (Double) -> Unit,
    onMuteToggle: () -> Unit,
    onVolumeChange: (Float) -> Unit,
    onPlaybackSpeedChange: (Float) -> Unit,
    onFullscreen: (() -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    val platform = remember(url) { detectPlatform(url) }
    val capabilities = remember(platform) { PlatformCapabilitiesRegistry.getCapabilities(platform) }
    
    var showSpeedMenu by remember { mutableStateOf(false) }
    var isScrubbing by remember { mutableStateOf(false) }
    var scrubFraction by remember { mutableFloatStateOf(0f) }
    
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(Black30)
            .padding(12.dp)
    ) {
        // Progress bar
        if (capabilities.canSeek && duration > 0) {
            val liveFraction = (currentTime / duration).toFloat().coerceIn(0f, 1f)
            val sliderValue = if (isScrubbing) scrubFraction else liveFraction
            val shownTime = if (isScrubbing) (scrubFraction.toDouble() * duration) else currentTime

            Slider(
                value = sliderValue,
                onValueChange = { fraction ->
                    isScrubbing = true
                    scrubFraction = fraction.coerceIn(0f, 1f)
                },
                onValueChangeFinished = {
                    if (duration > 0) {
                        onSeek(scrubFraction.toDouble() * duration)
                    }
                    isScrubbing = false
                },
                modifier = Modifier.fillMaxWidth(),
                colors = SliderDefaults.colors(
                    thumbColor = Slate50,
                    activeTrackColor = Indigo500,
                    inactiveTrackColor = White20
                )
            )
            
            // Time display
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = formatTime(shownTime),
                    style = TextStyle(color = Slate300, fontSize = 12.sp)
                )
                Text(
                    text = formatTime(duration),
                    style = TextStyle(color = Slate300, fontSize = 12.sp)
                )
            }
            
            Spacer(Modifier.height(8.dp))
        }
        
        // Control buttons
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Play/Pause
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (capabilities.canPlay) {
                    HuddleIconButton(
                        onClick = { if (isPlaying) onPause() else onPlay() },
                        icon = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                        contentDescription = if (isPlaying) "Pause" else "Play",
                        enabled = !isBuffering
                    )
                }
                
                // Skip buttons
                if (capabilities.canSeek) {
                    HuddleIconButton(
                        onClick = { onSeek(maxOf(0.0, currentTime - 10)) },
                        icon = Icons.Default.Replay10,
                        contentDescription = "Skip back 10 seconds",
                        size = 36.dp,
                        iconSize = 20.dp
                    )
                    HuddleIconButton(
                        onClick = { onSeek(minOf(duration, currentTime + 10)) },
                        icon = Icons.Default.Forward10,
                        contentDescription = "Skip forward 10 seconds",
                        size = 36.dp,
                        iconSize = 20.dp
                    )
                }
                
                // Buffering indicator
                if (isBuffering) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        color = Slate300,
                        strokeWidth = 2.dp
                    )
                }
            }
            
            // Volume and speed controls
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Mute button
                if (capabilities.canMute) {
                    HuddleIconButton(
                        onClick = onMuteToggle,
                        icon = if (isMuted || volume == 0f) Icons.Default.VolumeOff 
                               else if (volume < 0.5f) Icons.Default.VolumeDown 
                               else Icons.Default.VolumeUp,
                        contentDescription = if (isMuted) "Unmute" else "Mute",
                        size = 36.dp,
                        iconSize = 20.dp
                    )
                }
                
                // Speed menu
                if (capabilities.canChangeSpeed) {
                    Box {
                        HuddleSmallButton(
                            onClick = { showSpeedMenu = true },
                            isActive = playbackSpeed != 1f
                        ) {
                            Text(
                                text = "${playbackSpeed}x",
                                style = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Medium)
                            )
                        }
                        
                        DropdownMenu(
                            expanded = showSpeedMenu,
                            onDismissRequest = { showSpeedMenu = false },
                            modifier = Modifier.background(Slate800)
                        ) {
                            capabilities.speedOptions.forEach { speed ->
                                DropdownMenuItem(
                                    text = {
                                        Text(
                                            text = "${speed}x",
                                            color = if (playbackSpeed == speed) Indigo400 else Slate200
                                        )
                                    },
                                    onClick = {
                                        onPlaybackSpeedChange(speed)
                                        showSpeedMenu = false
                                    }
                                )
                            }
                        }
                    }
                }
                
                // Fullscreen
                if (onFullscreen != null) {
                    HuddleIconButton(
                        onClick = onFullscreen,
                        icon = Icons.Default.Fullscreen,
                        contentDescription = "Fullscreen",
                        size = 36.dp,
                        iconSize = 20.dp
                    )
                }
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
