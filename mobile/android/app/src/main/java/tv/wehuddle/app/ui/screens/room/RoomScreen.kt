package tv.wehuddle.app.ui.screens.room

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
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
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
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
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import tv.wehuddle.app.data.model.*
import tv.wehuddle.app.ui.components.*
import tv.wehuddle.app.ui.screens.room.components.*
import tv.wehuddle.app.ui.theme.*
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp

@Composable
fun RoomScreen(
    roomId: String,
    onNavigateBack: () -> Unit,
    onNavigateToLogin: (String) -> Unit,
    onNavigateToRegister: (String) -> Unit,
    viewModel: RoomViewModel = hiltViewModel()
) {
    val context = LocalContext.current
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
    
    // Tab state
    var selectedTab by remember { mutableIntStateOf(0) }
    val tabs = listOf("Video", "Controls", "Activity")

    // Define colors locally if not in theme
    val Slate950 = Color(0xFF020617)
    val Slate900 = Color(0xFF0F172A)
    val Slate400 = Color(0xFF94A3B8)
    val Slate50 = Color(0xFFF8FAFC)
    val Blue500 = Color(0xFF3B82F6)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Slate950)
            .statusBarsPadding()
            .imePadding() // CRITICAL: Moves UI up when keyboard opens
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
            onBack = onNavigateBack
        )

        // 2. Tabs (Always Visible)
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
                    onClick = { selectedTab = index },
                    modifier = Modifier.height(48.dp),
                    text = {
                        Text(
                            text = title,
                            style = TextStyle(
                                fontSize = 14.sp,
                                fontWeight = if (selectedTab == index) FontWeight.Bold else FontWeight.Medium,
                                color = if (selectedTab == index) Slate50 else Slate400
                            )
                        )
                    }
                )
            }
        }

        // 3. Content Area (Flexible Weight)
        // We do NOT put verticalScroll here. Each tab handles its own scrolling.
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
                    // ADD THESE LINES:
                    chatMessages = chatMessages,
                    chatInput = chatInput,
                    onChatInputChange = viewModel::updateChatInput,
                    onSendChat = viewModel::sendChatMessage,
                    modifier = Modifier.verticalScroll(rememberScrollState())
                )
                1 -> ControlsTabContent(
                    viewModel = viewModel,
                    roomState = roomState,
                    isHost = viewModel.isHost(),
                    modifier = Modifier.verticalScroll(rememberScrollState()) // Scroll happens here
                )
                2 -> ActivityTabContent(
                    activityLog = activityLog,
                    chatMessages = chatMessages,
                    chatInput = chatInput,
                    onChatInputChange = viewModel::updateChatInput,
                    onSendChat = viewModel::sendChatMessage,
                    localUserId = roomState.userId,
                    // No scroll modifier passed here, logic is inside to handle LazyColumn
                )
            }
        }

        // 4. Bottom Bar (Always Visible)
        BottomMediaBar(
            micEnabled = roomState.localMediaState.mic,
            camEnabled = roomState.localMediaState.cam,
            participants = participants
        )
    }
}

// --- TAB CONTENTS ---

@Composable
private fun VideoTabContent(
    videoUrl: String,
    onVideoUrlChange: (String) -> Unit,
    onLoadVideo: () -> Unit,
    roomState: RoomUiState,
    viewModel: RoomViewModel,
    // NEW PARAMS FOR CHAT
    chatMessages: List<ChatMessage>,
    chatInput: String,
    onChatInputChange: (String) -> Unit,
    onSendChat: () -> Unit,
    modifier: Modifier = Modifier
) {
    var isChatExpanded by remember { mutableStateOf(false) }

    Column(
        modifier = modifier.padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp)
    ) {
        // --- 1. Video URL Input (Same as before) ---
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
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
        }

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
                if (roomState.videoState.url.isNotEmpty()) {
                    VideoPlayerView(
                        url = roomState.videoState.url,
                        isPlaying = roomState.videoState.isPlaying,
                        currentTime = roomState.videoState.currentTime,
                        volume = roomState.videoState.volume,
                        isMuted = roomState.videoState.isMuted,
                        playbackSpeed = roomState.videoState.playbackSpeed,
                        onPlay = { viewModel.onPlay(roomState.videoState.currentTime) },
                        onPause = { viewModel.onPause(roomState.videoState.currentTime) },
                        onSeek = { time -> viewModel.onSeek(time) },
                        onProgress = { currentTime, duration ->
                            viewModel.updateVideoState { it.copy(currentTime = currentTime, duration = duration) }
                        },
                        onReady = {
                            viewModel.updateVideoState { it.copy(isReady = true) }
                        },
                        onError = { error ->
                            viewModel.updateVideoState { it.copy(error = error) }
                        },
                        modifier = Modifier.fillMaxSize()
                    )
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
                onSeek = { time -> viewModel.onSeek(time) },
                onMuteToggle = {
                    viewModel.setMuted(!roomState.videoState.isMuted)
                },
                onVolumeChange = { newVolume ->
                    viewModel.setVolume(newVolume.coerceIn(0f, 1f))
                },
                onPlaybackSpeedChange = { newSpeed ->
                    viewModel.setPlaybackSpeed(newSpeed.coerceIn(0.25f, 2f))
                },
                modifier = Modifier.fillMaxWidth()
            )
        }

        // --- 4. NEW: Expandable Live Chat ---
        // This is the "Modern, Hideable" Chat Section
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
        
        // Bottom Spacer to prevent hitting the bottom bar
        Spacer(modifier = Modifier.height(24.dp))
    }
}

@Composable
private fun ControlsTabContent(
    viewModel: RoomViewModel,
    roomState: RoomUiState,
    isHost: Boolean,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text("Media Controls", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 18.sp)
        
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            // Mic Toggle
            ControlTile(
                icon = if (roomState.localMediaState.mic) Icons.Default.Mic else Icons.Default.MicOff,
                label = "Mic",
                isActive = roomState.localMediaState.mic,
                onClick = viewModel::toggleMic,
                modifier = Modifier.weight(1f)
            )
            // Cam Toggle
            ControlTile(
                icon = if (roomState.localMediaState.cam) Icons.Default.Videocam else Icons.Default.VideocamOff,
                label = "Camera",
                isActive = roomState.localMediaState.cam,
                onClick = viewModel::toggleCam,
                modifier = Modifier.weight(1f)
            )
        }

        if (isHost) {
            Spacer(modifier = Modifier.height(16.dp))
            Text("Host Controls", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 18.sp)
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

@Composable
private fun ControlTile(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    isActive: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(if (isActive) Color(0xFF3B82F6) else Color(0xFF334155))
            .clickable(onClick = onClick)
            .padding(vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(icon, null, tint = Color.White, modifier = Modifier.size(32.dp))
        Spacer(Modifier.height(8.dp))
        Text(label, color = Color.White, fontSize = 14.sp)
    }
}

@Composable
private fun ActivityTabContent(
    activityLog: List<ActivityLogEntry>,
    chatMessages: List<ChatMessage>,
    chatInput: String,
    onChatInputChange: (String) -> Unit,
    onSendChat: () -> Unit,
    localUserId: String
) {
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
    participants: List<Participant>
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
                    label = "Mic",
                    isActive = micEnabled
                )
                MediaStatusChip(
                    icon = if (camEnabled) Icons.Default.Videocam else Icons.Default.VideocamOff,
                    label = "Cam",
                    isActive = camEnabled
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
    isActive: Boolean
) {
    Surface(
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