package tv.wehuddle.app.ui.screens.room.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
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
    onCopyInvite: () -> Unit,
    onOpenWheel: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = Black30
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Left side: back button and logo
            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(
                    onClick = onBack,
                    modifier = Modifier.size(40.dp)
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Back",
                        tint = Slate200
                    )
                }
                
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "🍿",
                        style = TextStyle(fontSize = 20.sp)
                    )
                    Text(
                        text = "Huddle",
                        style = TextStyle(
                            color = Slate50,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    )
                }
                
                // Room badge
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(20.dp))
                        .background(Black20)
                        .border(1.dp, White10, RoundedCornerShape(20.dp))
                        .padding(horizontal = 12.dp, vertical = 4.dp)
                ) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Room",
                            style = TextStyle(
                                color = Slate300,
                                fontSize = 12.sp
                            )
                        )
                        Text(
                            text = roomId,
                            style = TextStyle(
                                color = Slate200,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Medium
                            )
                        )
                    }
                }
            }
            
            // Right side: actions
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Wheel button
                HuddleSmallButton(onClick = onOpenWheel) {
                    Text(
                        text = "Wheel",
                        style = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Medium)
                    )
                }
                
                // Copy invite button
                HuddleSmallButton(onClick = onCopyInvite) {
                    Text(
                        text = if (copied) "Copied" else "Copy invite",
                        style = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Medium)
                    )
                }
                
                // Password badge
                PasswordBadge(hasPassword = hasRoomPassword)
                
                // Connection indicator
                ConnectionIndicator(isConnected = isConnected)
            }
        }
    }
}
