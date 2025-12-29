package tv.wehuddle.app.ui.screens.room

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import tv.wehuddle.app.data.model.*
import tv.wehuddle.app.ui.components.*
import tv.wehuddle.app.ui.screens.room.components.*
import tv.wehuddle.app.ui.theme.*

@Composable
fun RoomScreen(
    roomId: String,
    onNavigateBack: () -> Unit,
    viewModel: RoomViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val roomState by viewModel.roomState.collectAsStateWithLifecycle()
    val connectionState by viewModel.connectionState.collectAsStateWithLifecycle()
    val participants by viewModel.participants.collectAsStateWithLifecycle()
    val chatMessages by viewModel.chatMessages.collectAsStateWithLifecycle()
    val activityLog by viewModel.activityLog.collectAsStateWithLifecycle()
    val wheelState by viewModel.wheelState.collectAsStateWithLifecycle()
    
    val videoUrl by viewModel.videoUrl.collectAsStateWithLifecycle()
    val chatInput by viewModel.chatInput.collectAsStateWithLifecycle()
    val showWheelPicker by viewModel.showWheelPicker.collectAsStateWithLifecycle()
    val copied by viewModel.copied.collectAsStateWithLifecycle()
    
    // Password modal
    if (roomState.passwordRequired) {
        PasswordModal(
            passwordInput = viewModel.passwordInput.collectAsStateWithLifecycle().value,
            onPasswordChange = viewModel::updatePasswordInput,
            onSubmit = viewModel::submitPassword,
            error = roomState.passwordError
        )
    }
    
    // Wheel picker modal
    if (showWheelPicker) {
        WheelPickerModal(
            entries = wheelState.entries,
            entryInput = viewModel.wheelEntryInput.collectAsStateWithLifecycle().value,
            lastSpin = wheelState.lastSpin,
            onEntryInputChange = viewModel::updateWheelEntryInput,
            onAddEntry = viewModel::addWheelEntry,
            onRemoveEntry = viewModel::removeWheelEntry,
            onClearAll = viewModel::clearWheelEntries,
            onSpin = viewModel::spinWheel,
            onDismiss = viewModel::closeWheelPicker
        )
    }
    
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Slate950)
    ) {
        // Header
        RoomHeader(
            roomId = roomId,
            isConnected = connectionState == ConnectionState.CONNECTED,
            hasRoomPassword = roomState.hasRoomPassword,
            copied = copied,
            onCopyInvite = {
                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                val clip = ClipData.newPlainText("Huddle Invite", viewModel.getInviteLink())
                clipboard.setPrimaryClip(clip)
                viewModel.setCopied(true)
            },
            onOpenWheel = viewModel::toggleWheelPicker,
            onBack = onNavigateBack
        )
        
        // Main content
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Video URL input
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                HuddleTextField(
                    value = videoUrl,
                    onValueChange = viewModel::updateVideoUrl,
                    placeholder = "Paste video URL (YouTube, direct .mp4, etc.)",
                    modifier = Modifier.weight(1f)
                )
                
                HuddleSecondaryButton(
                    onClick = viewModel::loadVideo,
                    enabled = videoUrl.isNotBlank()
                ) {
                    Text("Load", style = TextStyle(fontWeight = FontWeight.Medium))
                }
            }
            
            // Video player section
            GlassCard {
                VideoPlayerView(
                    url = roomState.videoState.url,
                    isPlaying = roomState.videoState.isPlaying,
                    currentTime = roomState.videoState.currentTime,
                    volume = roomState.videoState.volume,
                    isMuted = roomState.videoState.isMuted,
                    playbackSpeed = roomState.videoState.playbackSpeed,
                    onPlay = { viewModel.onPlay(roomState.videoState.currentTime) },
                    onPause = { viewModel.onPause(roomState.videoState.currentTime) },
                    onSeek = viewModel::onSeek,
                    onProgress = { current, duration ->
                        viewModel.updateVideoState { 
                            it.copy(currentTime = current, duration = duration) 
                        }
                    },
                    onReady = {
                        viewModel.updateVideoState { it.copy(isReady = true) }
                    },
                    onError = { error ->
                        viewModel.updateVideoState { it.copy(error = error) }
                    }
                )
                
                Spacer(Modifier.height(12.dp))
                
                VideoControlsBar(
                    url = roomState.videoState.url,
                    isPlaying = roomState.videoState.isPlaying,
                    currentTime = roomState.videoState.currentTime,
                    duration = roomState.videoState.duration,
                    volume = roomState.videoState.volume,
                    isMuted = roomState.videoState.isMuted,
                    playbackSpeed = roomState.videoState.playbackSpeed,
                    isBuffering = roomState.videoState.isBuffering,
                    onPlay = { viewModel.onPlay(roomState.videoState.currentTime) },
                    onPause = { viewModel.onPause(roomState.videoState.currentTime) },
                    onSeek = viewModel::onSeek,
                    onMuteToggle = {
                        viewModel.updateVideoState { it.copy(isMuted = !it.isMuted) }
                    },
                    onVolumeChange = { volume ->
                        viewModel.updateVideoState { it.copy(volume = volume) }
                    },
                    onPlaybackSpeedChange = { speed ->
                        viewModel.updateVideoState { it.copy(playbackSpeed = speed) }
                    }
                )
            }
            
            // Call and Activity sections in row (tablet) or column (phone)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Call sidebar
                CallSidebar(
                    userId = roomState.userId,
                    hostId = roomState.hostId,
                    participants = participants,
                    localMediaState = roomState.localMediaState,
                    isSpeaking = roomState.isSpeaking,
                    isCollapsed = roomState.isCallCollapsed,
                    hasRoomPassword = roomState.hasRoomPassword,
                    isHost = viewModel.isHost(),
                    onToggleMic = viewModel::toggleMic,
                    onToggleCam = viewModel::toggleCam,
                    onToggleScreen = viewModel::toggleScreen,
                    onCollapse = { viewModel.setCallCollapsed(!roomState.isCallCollapsed) },
                    onKickUser = viewModel::kickUser,
                    onSetPassword = viewModel::setRoomPassword,
                    modifier = Modifier.weight(1f)
                )
                
                // Activity sidebar
                ActivitySidebar(
                    logs = activityLog,
                    chatMessages = chatMessages,
                    chatInput = chatInput,
                    userId = roomState.userId,
                    isCollapsed = roomState.isActivityCollapsed,
                    onChatInputChange = viewModel::updateChatInput,
                    onSendChat = viewModel::sendChatMessage,
                    onCollapse = { viewModel.setActivityCollapsed(!roomState.isActivityCollapsed) },
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }
}
