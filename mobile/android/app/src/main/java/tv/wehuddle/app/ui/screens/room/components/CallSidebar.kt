package tv.wehuddle.app.ui.screens.room.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import tv.wehuddle.app.data.model.*
import tv.wehuddle.app.ui.components.*
import tv.wehuddle.app.ui.theme.*

@Composable
fun CallSidebar(
    userId: String,
    hostId: String?,
    participants: List<Participant>,
    localMediaState: WebRTCMediaState,
    isSpeaking: Boolean,
    isCollapsed: Boolean,
    hasRoomPassword: Boolean,
    isHost: Boolean,
    onToggleMic: () -> Unit,
    onToggleCam: () -> Unit,
    onToggleScreen: () -> Unit,
    onCollapse: () -> Unit,
    onKickUser: (String) -> Unit,
    onSetPassword: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    var showPasswordEditor by remember { mutableStateOf(false) }
    var passwordDraft by remember { mutableStateOf("") }
    
    GlassCard(modifier = modifier) {
        // Header
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top
        ) {
            Column {
                Text(
                    text = "Call",
                    style = TextStyle(
                        color = Slate50,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "Screen share, webcam, and mic between users.",
                    style = TextStyle(
                        color = Slate400,
                        fontSize = 12.sp
                    )
                )
            }
            
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                SpeakingBadge(isSpeaking = isSpeaking)
                
                HuddleSmallButton(onClick = onCollapse) {
                    Text(
                        text = if (isCollapsed) "Expand" else "Collapse",
                        style = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Medium)
                    )
                }
            }
        }
        
        if (!isCollapsed) {
            Spacer(Modifier.height(16.dp))
            
            // Room password section
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(Black20)
                    .border(1.dp, White10, RoundedCornerShape(16.dp))
                    .padding(12.dp)
            ) {
                Column {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Room password",
                            style = TextStyle(
                                color = Slate100,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Medium
                            )
                        )
                        Text(
                            text = if (hasRoomPassword) "On" else "Off",
                            style = TextStyle(
                                color = Slate300,
                                fontSize = 12.sp
                            )
                        )
                    }
                    
                    if (isHost) {
                        Spacer(Modifier.height(8.dp))
                        
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            HuddleSmallButton(
                                onClick = { showPasswordEditor = !showPasswordEditor }
                            ) {
                                Text(
                                    text = when {
                                        showPasswordEditor -> "Close"
                                        hasRoomPassword -> "Change"
                                        else -> "Set"
                                    },
                                    style = TextStyle(fontSize = 12.sp)
                                )
                            }
                            
                            if (hasRoomPassword) {
                                HuddleSmallButton(
                                    onClick = {
                                        onSetPassword("")
                                        passwordDraft = ""
                                    }
                                ) {
                                    Text("Clear", style = TextStyle(fontSize = 12.sp))
                                }
                            }
                        }
                        
                        if (showPasswordEditor) {
                            Spacer(Modifier.height(8.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                HuddlePasswordField(
                                    value = passwordDraft,
                                    onValueChange = { passwordDraft = it },
                                    placeholder = if (hasRoomPassword) "New password" else "Set a password",
                                    modifier = Modifier.weight(1f)
                                )
                                HuddleSmallButton(
                                    onClick = {
                                        onSetPassword(passwordDraft.trim())
                                        passwordDraft = ""
                                        showPasswordEditor = false
                                    },
                                    enabled = passwordDraft.isNotBlank()
                                ) {
                                    Text("Save", style = TextStyle(fontSize = 12.sp))
                                }
                            }
                        }
                    }
                }
            }
            
            Spacer(Modifier.height(12.dp))
            
            // Media controls
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                HuddleSmallButton(
                    onClick = onToggleMic,
                    isActive = localMediaState.mic,
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(
                        imageVector = if (localMediaState.mic) Icons.Default.Mic else Icons.Default.MicOff,
                        contentDescription = "Mic",
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(
                        text = if (localMediaState.mic) "Mic On" else "Mic Off",
                        style = TextStyle(fontSize = 12.sp)
                    )
                }
                
                HuddleSmallButton(
                    onClick = onToggleCam,
                    isActive = localMediaState.cam,
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(
                        imageVector = if (localMediaState.cam) Icons.Default.Videocam else Icons.Default.VideocamOff,
                        contentDescription = "Cam",
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(
                        text = if (localMediaState.cam) "Cam On" else "Cam Off",
                        style = TextStyle(fontSize = 12.sp)
                    )
                }
                
                HuddleSmallButton(
                    onClick = onToggleScreen,
                    isActive = localMediaState.screen,
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(
                        imageVector = if (localMediaState.screen) Icons.Default.ScreenShare else Icons.Default.StopScreenShare,
                        contentDescription = "Screen",
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(
                        text = if (localMediaState.screen) "Screen On" else "Screen Off",
                        style = TextStyle(fontSize = 12.sp)
                    )
                }
            }
            
            Spacer(Modifier.height(16.dp))
            
            // Participants list
            Text(
                text = "Participants (${participants.size})",
                style = TextStyle(
                    color = Slate300,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium
                )
            )
            
            Spacer(Modifier.height(8.dp))
            
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.heightIn(max = 200.dp)
            ) {
                items(participants) { participant ->
                    ParticipantTile(
                        participant = participant,
                        isCurrentUser = participant.id == userId,
                        canKick = isHost && participant.id != userId,
                        onKick = { onKickUser(participant.id) }
                    )
                }
            }
        }
    }
}

@Composable
private fun ParticipantTile(
    participant: Participant,
    isCurrentUser: Boolean,
    canKick: Boolean,
    onKick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(Black20)
            .border(1.dp, White10, RoundedCornerShape(12.dp))
            .padding(12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Avatar with speaking indicator
            Box {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(CircleShape)
                        .background(if (participant.isSpeaking) Emerald500.copy(alpha = 0.2f) else Slate700)
                        .then(
                            if (participant.isSpeaking) {
                                Modifier.border(2.dp, Emerald500, CircleShape)
                            } else Modifier
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Person,
                        contentDescription = null,
                        tint = Slate300,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
            
            Column {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    val displayName = participant.username?.takeIf { it.isNotBlank() } ?: participant.id.take(8)
                    Text(
                        text = displayName,
                        style = TextStyle(
                            color = Slate100,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Medium
                        )
                    )
                    if (isCurrentUser) {
                        Text(
                            text = "You",
                            style = TextStyle(
                                color = Slate300,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Medium
                            )
                        )
                    }
                    if (participant.isHost) {
                        Text(
                            text = "Host",
                            style = TextStyle(
                                color = Amber200,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Medium
                            )
                        )
                    }
                }
                
                // Media state indicators
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    if (participant.mediaState.mic) {
                        Icon(
                            imageVector = Icons.Default.Mic,
                            contentDescription = "Mic on",
                            tint = Emerald500,
                            modifier = Modifier.size(14.dp)
                        )
                    }
                    if (participant.mediaState.cam) {
                        Icon(
                            imageVector = Icons.Default.Videocam,
                            contentDescription = "Cam on",
                            tint = Emerald500,
                            modifier = Modifier.size(14.dp)
                        )
                    }
                    if (participant.mediaState.screen) {
                        Icon(
                            imageVector = Icons.Default.ScreenShare,
                            contentDescription = "Screen sharing",
                            tint = Emerald500,
                            modifier = Modifier.size(14.dp)
                        )
                    }
                }
            }
        }
        
        if (canKick) {
            IconButton(
                onClick = onKick,
                modifier = Modifier.size(32.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Close,
                    contentDescription = "Kick user",
                    tint = Rose500,
                    modifier = Modifier.size(16.dp)
                )
            }
        }
    }
}
