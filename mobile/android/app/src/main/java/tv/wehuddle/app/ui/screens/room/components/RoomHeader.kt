package tv.wehuddle.app.ui.screens.room.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.QueueMusic
import androidx.compose.material.icons.filled.Casino
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
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
        color = Color(0xCC020617), // slate-950 / 80% — backdrop-blur stand-in
        shadowElevation = 0.dp
    ) {
        Column {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // --- LEFT: back + brand + room badge ---
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.weight(1f, fill = false)
                ) {
                    IconButton(onClick = onBack, modifier = Modifier.size(32.dp)) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                            tint = Slate200,
                            modifier = Modifier.size(20.dp)
                        )
                    }

                    Text("🍿", style = TextStyle(fontSize = 18.sp))
                    Text(
                        text = "Huddle",
                        style = TextStyle(
                            color = Slate50,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold
                        )
                    )

                    // Room badge (compact pill)
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(50))
                            .background(Black20)
                            .border(1.dp, White10, RoundedCornerShape(50))
                            .padding(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Text(
                            text = roomId,
                            style = TextStyle(
                                color = Slate300,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Medium,
                                letterSpacing = 0.4.sp
                            )
                        )
                    }
                }

                // --- RIGHT: actions + status pills ---
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (authUsername.isNullOrBlank()) {
                        HuddleSmallButton(onClick = onLogin) {
                            Text("Log in", fontSize = 11.sp)
                        }
                    } else {
                        Text(
                            text = "@$authUsername",
                            style = TextStyle(
                                color = Slate200,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Medium
                            ),
                            modifier = Modifier.padding(end = 2.dp)
                        )
                    }

                    // Save (star icon, amber-active)
                    HeaderIconPill(
                        onClick = if (canSave) onToggleSave else onLogin,
                        enabled = canSave && !saveBusy,
                        active = isSaved,
                        activeBorder = Color(0xFFFCD34D), // amber-300
                        activeContainer = Color(0x1AFCD34D),
                        activeTint = Color(0xFFFDE68A) // amber-200
                    ) {
                        Icon(
                            imageVector = if (isSaved) Icons.Filled.Star else Icons.Filled.StarBorder,
                            contentDescription = if (isSaved) "Unsave room" else "Save room",
                            modifier = Modifier.size(14.dp),
                            tint = LocalContentColor.current
                        )
                    }

                    // Wheel
                    HeaderIconPill(onClick = onOpenWheel) {
                        Icon(
                            Icons.Filled.Casino,
                            contentDescription = "Open wheel",
                            modifier = Modifier.size(14.dp),
                            tint = Slate200
                        )
                    }

                    // Playlist
                    HeaderIconPill(onClick = onOpenPlaylist) {
                        Icon(
                            Icons.AutoMirrored.Filled.QueueMusic,
                            contentDescription = "Open playlist",
                            modifier = Modifier.size(14.dp),
                            tint = Slate200
                        )
                    }

                    // Copy invite (with check pulse)
                    HeaderIconPill(
                        onClick = onCopyInvite,
                        active = copied,
                        activeBorder = Emerald500,
                        activeContainer = Color(0x1A10B981),
                        activeTint = Emerald200
                    ) {
                        Icon(
                            imageVector = if (copied) Icons.Filled.Check else Icons.Filled.ContentCopy,
                            contentDescription = if (copied) "Invite copied" else "Copy invite link",
                            modifier = Modifier.size(14.dp),
                            tint = LocalContentColor.current
                        )
                    }

                    // Locked pill (only when password is set)
                    if (hasRoomPassword) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            modifier = Modifier
                                .clip(RoundedCornerShape(50))
                                .background(Color(0x1AFCD34D))
                                .border(1.dp, Color(0x66FCD34D), RoundedCornerShape(50))
                                .padding(horizontal = 8.dp, vertical = 4.dp)
                        ) {
                            Icon(
                                Icons.Filled.Lock,
                                contentDescription = "Room is locked",
                                tint = Color(0xFFFDE68A),
                                modifier = Modifier.size(12.dp)
                            )
                            Text(
                                "Locked",
                                style = TextStyle(
                                    color = Color(0xFFFDE68A),
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Medium
                                )
                            )
                        }
                    }

                    // Live / Offline status pill (replaces the bare connection dot)
                    LiveStatusPill(isConnected = isConnected)
                }
            }

            // 1px hairline shadow under header — mirrors web's translucent backdrop
            HorizontalDivider(thickness = 1.dp, color = White10)
        }
    }
}

@Composable
private fun HeaderIconPill(
    onClick: () -> Unit,
    enabled: Boolean = true,
    active: Boolean = false,
    activeBorder: Color = Indigo500,
    activeContainer: Color = Color(0x336366F1),
    activeTint: Color = Indigo400,
    content: @Composable () -> Unit
) {
    val container = if (active) activeContainer else Black20
    val border = if (active) activeBorder.copy(alpha = 0.4f) else White10
    val contentColor = if (active) activeTint else Slate200
    Surface(
        onClick = onClick,
        enabled = enabled,
        shape = RoundedCornerShape(50),
        color = container,
        border = androidx.compose.foundation.BorderStroke(1.dp, border),
        modifier = Modifier
            .height(28.dp)
            .alpha(if (enabled) 1f else 0.5f)
    ) {
        Box(
            modifier = Modifier
                .padding(horizontal = 10.dp, vertical = 0.dp)
                .fillMaxHeight(),
            contentAlignment = Alignment.Center
        ) {
            CompositionLocalProvider(LocalContentColor provides contentColor) {
                content()
            }
        }
    }
}

@Composable
private fun LiveStatusPill(isConnected: Boolean) {
    // Soft animated dot: full opacity when connected (with subtle pulse), red
    // when offline. Same visual language as the web app's "Live"/"Offline" pill.
    val pulse by animateFloatAsState(
        targetValue = if (isConnected) 1f else 0.6f,
        animationSpec = tween(durationMillis = 800),
        label = "live-pulse"
    )

    val border = if (isConnected) Emerald500.copy(alpha = 0.35f) else Rose500.copy(alpha = 0.5f)
    val container = if (isConnected) Color(0x1A10B981) else Color(0x1AF43F5E)
    val text = if (isConnected) "Live" else "Offline"
    val textColor = if (isConnected) Emerald200 else Color(0xFFFCA5A5)
    val dot = if (isConnected) Emerald500 else Rose500

    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(container)
            .border(1.dp, border, RoundedCornerShape(50))
            .padding(horizontal = 8.dp, vertical = 4.dp)
    ) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .alpha(pulse)
                .background(dot, CircleShape)
        )
        Text(
            text = text,
            style = TextStyle(
                color = textColor,
                fontSize = 10.sp,
                fontWeight = FontWeight.Medium,
                letterSpacing = 0.3.sp
            )
        )
    }
}
