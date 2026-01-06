package tv.wehuddle.app.ui.screens.room.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import tv.wehuddle.app.ui.components.*
import tv.wehuddle.app.ui.theme.*

@Composable
fun RoomHeader(
    roomId: String,
    isConnected: Boolean,
    hasRoomPassword: Boolean,
    copied: Boolean,
    authUsername: String?,
    canSave: Boolean,
    isSaved: Boolean,
    saveBusy: Boolean,
    onLogin: () -> Unit,
    onRegister: () -> Unit,
    onToggleSave: () -> Unit,
    onCopyInvite: () -> Unit,
    onOpenWheel: () -> Unit,
    onOpenPlaylist: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = Slate900,
        shadowElevation = 4.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // --- LEFT SIDE ---
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                IconButton(
                    onClick = onBack,
                    modifier = Modifier.size(32.dp)
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Back",
                        tint = Slate200,
                        modifier = Modifier.size(20.dp)
                    )
                }

                Text(text = "🍿", style = TextStyle(fontSize = 20.sp))
                
                Text(
                    text = "Huddle",
                    style = TextStyle(
                        color = Slate50,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold
                    ),
                    modifier = Modifier.padding(end = 4.dp)
                )

                // Room Badge (Compact)
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(16.dp))
                        .background(Slate800)
                        .border(1.dp, Slate700, RoundedCornerShape(16.dp))
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = roomId,
                        style = TextStyle(
                            color = Slate400,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Medium,
                            letterSpacing = 0.5.sp
                        )
                    )
                }
            }

            // --- RIGHT SIDE ---
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (authUsername.isNullOrBlank()) {
                    HuddleSmallButton(
                        onClick = onLogin,
                        enabled = !saveBusy
                    ) {
                        Text("Log in", fontSize = 12.sp)
                    }
                    HuddleSmallButton(
                        onClick = onRegister,
                        enabled = !saveBusy
                    ) {
                        Text("Register", fontSize = 12.sp)
                    }
                } else {
                    Text(
                        text = "@${authUsername}",
                        style = TextStyle(
                            color = Slate200,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium
                        )
                    )
                }

                HuddleSmallButton(
                    onClick = if (canSave) onToggleSave else onLogin,
                    enabled = canSave && !saveBusy,
                    isActive = isSaved
                ) {
                    Text(if (isSaved) "Saved" else "Save", fontSize = 12.sp)
                }

                // Wheel Icon Button
                FilledIconButton(
                    onClick = onOpenWheel,
                    modifier = Modifier.size(32.dp),
                    colors = IconButtonDefaults.filledIconButtonColors(containerColor = Slate800)
                ) {
                   Text("🎡", fontSize = 14.sp)
                }
                
                // Playlist Icon Button
                FilledIconButton(
                    onClick = onOpenPlaylist,
                    modifier = Modifier.size(32.dp),
                    colors = IconButtonDefaults.filledIconButtonColors(containerColor = Slate800)
                ) {
                   Text("📋", fontSize = 14.sp)
                }

                // Connection Dot
                Box(
                    modifier = Modifier
                        .size(10.dp)
                        .background(
                            if (isConnected) Emerald500 else Rose500,
                            shape = RoundedCornerShape(50)
                        )
                )
            }
        }
    }
}