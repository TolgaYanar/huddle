package tv.wehuddle.app.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.webrtc.EglBase
import org.webrtc.MediaStream
import tv.wehuddle.app.data.model.Participant
import tv.wehuddle.app.data.model.WebRTCMediaState
import tv.wehuddle.app.data.webrtc.VersionedValue

internal enum class CallVideoPresentation {
    CAMERA_OFF,
    WAITING_FOR_STREAM,
    VIDEO,
}

internal data class CallStripTileState(
    val stableKey: String,
    val peerId: String,
    val username: String,
    val isLocal: Boolean,
    val isSpeaking: Boolean,
    val mediaState: WebRTCMediaState,
    val videoPresentation: CallVideoPresentation,
)

internal data class CallStripSizing(
    val tileWidthDp: Int,
    val tileHeightDp: Int,
    val verticalPaddingDp: Int,
    val showHeader: Boolean,
    val showLocalControls: Boolean,
)

internal fun callStripSizing(isTv: Boolean, isHeightCompact: Boolean): CallStripSizing {
    return when {
        isHeightCompact -> CallStripSizing(
            tileWidthDp = 104,
            tileHeightDp = 76,
            verticalPaddingDp = 4,
            showHeader = false,
            showLocalControls = false,
        )
        isTv -> CallStripSizing(
            tileWidthDp = 188,
            tileHeightDp = 136,
            verticalPaddingDp = 10,
            showHeader = true,
            showLocalControls = true,
        )
        else -> CallStripSizing(
            tileWidthDp = 148,
            tileHeightDp = 108,
            verticalPaddingDp = 10,
            showHeader = true,
            showLocalControls = true,
        )
    }
}

/**
 * Builds a stable tile list independently of the native WebRTC objects. Keeping
 * this projection pure makes camera-off and late-stream transitions testable
 * without loading JNI in local unit tests.
 */
internal fun buildCallStripTileStates(
    localUserId: String,
    localUsername: String,
    localMediaState: WebRTCMediaState,
    localIsSpeaking: Boolean,
    localStreamAvailable: Boolean,
    participants: List<Participant>,
    remoteStreamPeerIds: Set<String>,
): List<CallStripTileState> {
    fun presentation(cameraEnabled: Boolean, streamAvailable: Boolean) = when {
        !cameraEnabled -> CallVideoPresentation.CAMERA_OFF
        streamAvailable -> CallVideoPresentation.VIDEO
        else -> CallVideoPresentation.WAITING_FOR_STREAM
    }

    val localTile = CallStripTileState(
        stableKey = "local",
        peerId = localUserId,
        username = localUsername.ifBlank { "You" },
        isLocal = true,
        isSpeaking = localIsSpeaking,
        mediaState = localMediaState,
        videoPresentation = presentation(localMediaState.cam, localStreamAvailable),
    )
    val remoteTiles = participants
        .asSequence()
        .filter { participant ->
            participant.id.isNotBlank() &&
                participant.id != localUserId &&
                !participant.isLocal
        }
        .distinctBy(Participant::id)
        .map { participant ->
            CallStripTileState(
                stableKey = "remote:${participant.id}",
                peerId = participant.id,
                username = participant.username?.takeIf(String::isNotBlank)
                    ?: participant.id.take(8),
                isLocal = false,
                isSpeaking = participant.isSpeaking,
                mediaState = participant.mediaState,
                videoPresentation = presentation(
                    participant.mediaState.cam,
                    participant.id in remoteStreamPeerIds,
                ),
            )
        }
        .toList()

    return listOf(localTile) + remoteTiles
}

/**
 * Always-visible call surface for normal room layouts. A participant remains
 * in the same keyed tile while their camera is off, connecting, or streaming,
 * so a late remote track updates the renderer instead of moving the UI.
 */
@Composable
fun RoomCallStrip(
    eglContext: EglBase.Context?,
    localUserId: String,
    localUsername: String,
    localStream: MediaStream?,
    localMediaState: WebRTCMediaState,
    localIsSpeaking: Boolean,
    participants: List<Participant>,
    remoteStreams: Map<String, VersionedValue<MediaStream>>,
    onToggleMic: () -> Unit,
    onToggleCamera: () -> Unit,
    modifier: Modifier = Modifier,
    isTv: Boolean = false,
    isHeightCompact: Boolean = false,
) {
    val tiles = buildCallStripTileStates(
        localUserId = localUserId,
        localUsername = localUsername,
        localMediaState = localMediaState,
        localIsSpeaking = localIsSpeaking,
        localStreamAvailable = localStream
            ?.videoTracks
            ?.firstOrNull()
            ?.enabled() == true,
        participants = participants,
        remoteStreamPeerIds = remoteStreams
            .filterValues { snapshot ->
                snapshot.value.videoTracks.firstOrNull()?.enabled() == true
            }
            .keys,
    )
    val sizing = callStripSizing(isTv, isHeightCompact)
    val tileWidth = sizing.tileWidthDp.dp
    val tileHeight = sizing.tileHeightDp.dp

    Surface(
        modifier = modifier.testTag("room-call-strip"),
        color = MaterialTheme.colorScheme.surfaceContainer,
        shape = RoundedCornerShape(if (isTv) 16.dp else 12.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(
            modifier = Modifier.padding(vertical = sizing.verticalPaddingDp.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (sizing.showHeader) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "Call",
                        color = MaterialTheme.colorScheme.onSurface,
                        style = MaterialTheme.typography.titleSmall,
                    )
                    Text(
                        text = if (tiles.size == 1) "Only you" else "${tiles.size} people",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.labelMedium,
                    )
                }
            }

            LazyRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(tileHeight),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(tiles, key = CallStripTileState::stableKey) { tile ->
                    Surface(
                        modifier = Modifier
                            .width(tileWidth)
                            .aspectRatio(4f / 3f)
                            .testTag("call-tile-${tile.stableKey}"),
                        color = MaterialTheme.colorScheme.surface,
                        shape = RoundedCornerShape(12.dp),
                        border = BorderStroke(
                            width = if (tile.isSpeaking) 2.dp else 1.dp,
                            color = if (tile.isSpeaking) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.outlineVariant
                            },
                        ),
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(if (tile.isSpeaking) 2.dp else 1.dp)
                                .clip(RoundedCornerShape(10.dp)),
                        ) {
                            if (tile.isLocal) {
                                LocalVideoTile(
                                    modifier = Modifier.fillMaxSize(),
                                    eglContext = eglContext,
                                    stream = localStream,
                                    mediaState = tile.mediaState,
                                    username = tile.username,
                                    onToggleMic = onToggleMic,
                                    onToggleCamera = onToggleCamera,
                                    showControls = sizing.showLocalControls,
                                )
                            } else {
                                RemoteVideoTile(
                                    modifier = Modifier.fillMaxSize(),
                                    eglContext = eglContext,
                                    stream = remoteStreams[tile.peerId]?.value,
                                    username = tile.username,
                                    mediaState = tile.mediaState,
                                )
                                if (tile.videoPresentation == CallVideoPresentation.WAITING_FOR_STREAM) {
                                    Surface(
                                        modifier = Modifier.align(Alignment.Center),
                                        color = Color.Black.copy(alpha = 0.56f),
                                        shape = RoundedCornerShape(18.dp),
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp),
                                            horizontalArrangement = Arrangement.spacedBy(7.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                        ) {
                                            CircularProgressIndicator(
                                                modifier = Modifier
                                                    .width(14.dp)
                                                    .height(14.dp),
                                                color = Color.White,
                                                strokeWidth = 2.dp,
                                            )
                                            Text("Connecting", color = Color.White, fontSize = 11.sp)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
