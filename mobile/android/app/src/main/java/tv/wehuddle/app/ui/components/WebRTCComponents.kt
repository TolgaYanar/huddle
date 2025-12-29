package tv.wehuddle.app.ui.components

import android.view.ViewGroup
import androidx.compose.foundation.background
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import org.webrtc.EglBase
import org.webrtc.MediaStream
import org.webrtc.RendererCommon
import org.webrtc.SurfaceViewRenderer
import tv.wehuddle.app.data.model.WebRTCMediaState

/**
 * Composable wrapper for WebRTC SurfaceViewRenderer
 */
@Composable
fun WebRTCVideoView(
    modifier: Modifier = Modifier,
    eglContext: EglBase.Context?,
    stream: MediaStream?,
    isMirrored: Boolean = false,
    scalingType: RendererCommon.ScalingType = RendererCommon.ScalingType.SCALE_ASPECT_FIT
) {
    val context = LocalContext.current
    var renderer by remember { mutableStateOf<SurfaceViewRenderer?>(null) }
    
    DisposableEffect(eglContext) {
        onDispose {
            renderer?.release()
            renderer = null
        }
    }
    
    // Update stream when it changes
    LaunchedEffect(stream) {
        renderer?.let { r ->
            stream?.videoTracks?.firstOrNull()?.let { track ->
                track.addSink(r)
            }
        }
    }
    
    AndroidView(
        factory = { ctx ->
            SurfaceViewRenderer(ctx).apply {
                layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
                
                eglContext?.let { egl ->
                    init(egl, null)
                    setScalingType(scalingType)
                    setMirror(isMirrored)
                    setEnableHardwareScaler(true)
                }
                
                renderer = this
                
                // Add video track sink if stream is available
                stream?.videoTracks?.firstOrNull()?.addSink(this)
            }
        },
        modifier = modifier,
        onRelease = { view ->
            stream?.videoTracks?.firstOrNull()?.removeSink(view)
            view.release()
        }
    )
}

/**
 * Local camera preview tile
 */
@Composable
fun LocalVideoTile(
    modifier: Modifier = Modifier,
    eglContext: EglBase.Context?,
    stream: MediaStream?,
    mediaState: WebRTCMediaState,
    username: String,
    onToggleMic: () -> Unit,
    onToggleCamera: () -> Unit
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
    ) {
        if (mediaState.cam && stream != null) {
            WebRTCVideoView(
                modifier = Modifier.fillMaxSize(),
                eglContext = eglContext,
                stream = stream,
                isMirrored = true,
                scalingType = RendererCommon.ScalingType.SCALE_ASPECT_FILL
            )
        } else {
            // Camera off placeholder
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.surface),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.VideocamOff,
                        contentDescription = "Camera off",
                        modifier = Modifier.size(32.dp),
                        tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = username,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                    )
                }
            }
        }
        
        // Media controls overlay
        Row(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            IconButton(
                onClick = onToggleMic,
                modifier = Modifier
                    .size(36.dp)
                    .background(
                        color = if (mediaState.mic) 
                            MaterialTheme.colorScheme.primary.copy(alpha = 0.8f)
                        else 
                            MaterialTheme.colorScheme.error.copy(alpha = 0.8f),
                        shape = RoundedCornerShape(18.dp)
                    )
            ) {
                Icon(
                    imageVector = if (mediaState.mic) Icons.Default.Mic else Icons.Default.MicOff,
                    contentDescription = if (mediaState.mic) "Mute" else "Unmute",
                    modifier = Modifier.size(18.dp),
                    tint = Color.White
                )
            }
            
            IconButton(
                onClick = onToggleCamera,
                modifier = Modifier
                    .size(36.dp)
                    .background(
                        color = if (mediaState.cam) 
                            MaterialTheme.colorScheme.primary.copy(alpha = 0.8f)
                        else 
                            MaterialTheme.colorScheme.error.copy(alpha = 0.8f),
                        shape = RoundedCornerShape(18.dp)
                    )
            ) {
                Icon(
                    imageVector = if (mediaState.cam) Icons.Default.Videocam else Icons.Default.VideocamOff,
                    contentDescription = if (mediaState.cam) "Turn off camera" else "Turn on camera",
                    modifier = Modifier.size(18.dp),
                    tint = Color.White
                )
            }
        }
        
        // Username label
        Surface(
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(8.dp),
            color = Color.Black.copy(alpha = 0.6f),
            shape = RoundedCornerShape(4.dp)
        ) {
            Text(
                text = username,
                style = MaterialTheme.typography.labelSmall,
                color = Color.White,
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
            )
        }
    }
}

/**
 * Remote participant video tile
 */
@Composable
fun RemoteVideoTile(
    modifier: Modifier = Modifier,
    eglContext: EglBase.Context?,
    stream: MediaStream?,
    username: String,
    mediaState: WebRTCMediaState?
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
    ) {
        val hasVideo = stream?.videoTracks?.firstOrNull()?.enabled() == true &&
                       mediaState?.cam != false
        
        if (hasVideo && stream != null) {
            WebRTCVideoView(
                modifier = Modifier.fillMaxSize(),
                eglContext = eglContext,
                stream = stream,
                isMirrored = false,
                scalingType = RendererCommon.ScalingType.SCALE_ASPECT_FILL
            )
        } else {
            // No video placeholder
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.surface),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Person,
                        contentDescription = "No video",
                        modifier = Modifier.size(48.dp),
                        tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = username,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                    )
                }
            }
        }
        
        // Media state indicators
        Row(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(8.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            mediaState?.let { state ->
                if (!state.mic) {
                    Surface(
                        color = MaterialTheme.colorScheme.error.copy(alpha = 0.8f),
                        shape = RoundedCornerShape(4.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.MicOff,
                            contentDescription = "Muted",
                            modifier = Modifier
                                .size(20.dp)
                                .padding(2.dp),
                            tint = Color.White
                        )
                    }
                }
            }
        }
        
        // Username label
        Surface(
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(8.dp),
            color = Color.Black.copy(alpha = 0.6f),
            shape = RoundedCornerShape(4.dp)
        ) {
            Text(
                text = username,
                style = MaterialTheme.typography.labelSmall,
                color = Color.White,
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
            )
        }
    }
}

/**
 * Grid layout for multiple video tiles
 */
@Composable
fun VideoTileGrid(
    modifier: Modifier = Modifier,
    tiles: List<@Composable () -> Unit>
) {
    val tileCount = tiles.size
    
    when {
        tileCount == 0 -> {
            Box(
                modifier = modifier,
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "No participants in call",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
                )
            }
        }
        tileCount == 1 -> {
            Box(modifier = modifier) {
                tiles[0]()
            }
        }
        tileCount == 2 -> {
            Row(
                modifier = modifier,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                tiles.forEach { tile ->
                    Box(modifier = Modifier.weight(1f)) {
                        tile()
                    }
                }
            }
        }
        tileCount <= 4 -> {
            Column(
                modifier = modifier,
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Row(
                    modifier = Modifier.weight(1f),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    tiles.take(2).forEach { tile ->
                        Box(modifier = Modifier.weight(1f)) {
                            tile()
                        }
                    }
                }
                if (tileCount > 2) {
                    Row(
                        modifier = Modifier.weight(1f),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        tiles.drop(2).forEach { tile ->
                            Box(modifier = Modifier.weight(1f)) {
                                tile()
                            }
                        }
                        // Fill remaining space if odd number
                        if (tileCount == 3) {
                            Spacer(modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
        }
        else -> {
            // For more than 4, use a scrollable grid
            Column(
                modifier = modifier,
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                tiles.chunked(2).forEach { rowTiles ->
                    Row(
                        modifier = Modifier.weight(1f),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        rowTiles.forEach { tile ->
                            Box(modifier = Modifier.weight(1f)) {
                                tile()
                            }
                        }
                        if (rowTiles.size == 1) {
                            Spacer(modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
        }
    }
}
