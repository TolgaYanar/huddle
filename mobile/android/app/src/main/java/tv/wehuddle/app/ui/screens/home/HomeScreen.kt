package tv.wehuddle.app.ui.screens.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import tv.wehuddle.app.ui.components.*
import tv.wehuddle.app.ui.theme.*

@Composable
fun HomeScreen(
    onNavigateToRoom: (String) -> Unit,
    viewModel: HomeViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val normalizedJoin = remember(uiState.joinInput) { 
        viewModel.normalizeRoomId(uiState.joinInput) 
    }
    
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                brush = androidx.compose.ui.graphics.Brush.verticalGradient(
                    colors = listOf(Slate900, Slate950, Slate950)
                )
            )
    ) {
        Column(
            modifier = Modifier.fillMaxSize()
        ) {
            // Header
            HomeHeader()
            
            // Main content
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 24.dp),
                contentAlignment = Alignment.Center
            ) {
                GlassCard(
                    modifier = Modifier.widthIn(max = 400.dp)
                ) {
                    // Title
                    Text(
                        text = "Create or join a room",
                        style = TextStyle(
                            color = Slate50,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    )
                    
                    Spacer(Modifier.height(4.dp))
                    
                    Text(
                        text = "Rooms are just URLs you can share with friends.",
                        style = TextStyle(
                            color = Slate400,
                            fontSize = 14.sp
                        )
                    )
                    
                    Spacer(Modifier.height(20.dp))
                    
                    // Continue last room button
                    if (uiState.lastRoomId != null) {
                        HuddleSecondaryButton(
                            onClick = { onNavigateToRoom(uiState.lastRoomId!!) },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = "Continue last room",
                                style = TextStyle(fontWeight = FontWeight.SemiBold)
                            )
                        }
                        
                        Spacer(Modifier.height(12.dp))
                    }
                    
                    // Create new room button
                    HuddlePrimaryButton(
                        onClick = {
                            val roomId = viewModel.generateRoomId()
                            onNavigateToRoom(roomId)
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            text = "Create a new room",
                            style = TextStyle(fontWeight = FontWeight.SemiBold)
                        )
                    }
                    
                    Spacer(Modifier.height(12.dp))
                    
                    // Join room input
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        HuddleTextField(
                            value = uiState.joinInput,
                            onValueChange = { viewModel.updateJoinInput(it) },
                            placeholder = "Enter room name or paste invite link",
                            modifier = Modifier.weight(1f)
                        )
                        
                        HuddleSecondaryButton(
                            onClick = {
                                if (normalizedJoin.isNotEmpty()) {
                                    onNavigateToRoom(normalizedJoin)
                                }
                            },
                            enabled = normalizedJoin.isNotEmpty()
                        ) {
                            Text(
                                text = "Join",
                                style = TextStyle(fontWeight = FontWeight.Medium)
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun HomeHeader() {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = Black30,
        shadowElevation = 0.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "🍿",
                    style = TextStyle(fontSize = 24.sp)
                )
                Text(
                    text = "Huddle",
                    style = TextStyle(
                        color = Slate50,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.SemiBold,
                        letterSpacing = (-0.5).sp
                    )
                )
            }
        }
    }
}
