package tv.wehuddle.app.ui.screens.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import tv.wehuddle.app.ui.components.*
import tv.wehuddle.app.ui.theme.*
import tv.wehuddle.app.util.isTV
import tv.wehuddle.app.util.onDpadKeyEvent
import tv.wehuddle.app.util.rememberScreenSize
import tv.wehuddle.app.data.model.HomeUiState

@Composable
fun HomeScreen(
    onNavigateToRoom: (String) -> Unit,
    onNavigateToLogin: (String?) -> Unit,
    onNavigateToRegister: (String?) -> Unit,
    viewModel: HomeViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val normalizedJoin = remember(uiState.joinInput) { 
        viewModel.normalizeRoomId(uiState.joinInput) 
    }
    
    val isTV = isTV()
    val screenSize = rememberScreenSize()
    val focusManager = LocalFocusManager.current
    
    // Focus requesters for TV navigation
    val createRoomFocusRequester = remember { FocusRequester() }
    val joinInputFocusRequester = remember { FocusRequester() }
    
    // Request initial focus on TV
    LaunchedEffect(isTV) {
        if (isTV) {
            createRoomFocusRequester.requestFocus()
        }
    }
    
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                brush = androidx.compose.ui.graphics.Brush.verticalGradient(
                    colors = listOf(Slate900, Slate950, Slate950)
                )
            )
            .then(
                if (isTV) {
                    Modifier.onDpadKeyEvent(
                        onBack = {
                            // Handle back on TV - could show exit dialog
                            false
                        }
                    )
                } else {
                    Modifier
                }
            )
    ) {
        Column(
            modifier = Modifier.fillMaxSize()
        ) {
            // Header - TV optimized
            HomeHeader(
                authUsername = uiState.authUser?.username,
                onLogin = { onNavigateToLogin(null) },
                onRegister = { onNavigateToRegister(null) },
                onLogout = viewModel::logout,
                isTV = isTV
            )
            
            // Main content
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = if (isTV) 48.dp else 24.dp),
                contentAlignment = Alignment.Center
            ) {
                if (isTV && screenSize.isWide) {
                    // TV Wide Layout - Horizontal arrangement
                    TvWideHomeContent(
                        uiState = uiState,
                        normalizedJoin = normalizedJoin,
                        onNavigateToRoom = onNavigateToRoom,
                        onJoinInputChange = viewModel::updateJoinInput,
                        onGenerateRoomId = viewModel::generateRoomId,
                        createRoomFocusRequester = createRoomFocusRequester,
                        joinInputFocusRequester = joinInputFocusRequester
                    )
                } else {
                    // Mobile/Tablet Layout - Vertical card
                    MobileHomeContent(
                        uiState = uiState,
                        normalizedJoin = normalizedJoin,
                        onNavigateToRoom = onNavigateToRoom,
                        onJoinInputChange = viewModel::updateJoinInput,
                        onGenerateRoomId = viewModel::generateRoomId,
                        createRoomFocusRequester = createRoomFocusRequester,
                        joinInputFocusRequester = joinInputFocusRequester,
                        isTV = isTV
                    )
                }
            }
        }
    }
}

@Composable
private fun TvWideHomeContent(
    uiState: HomeUiState,
    normalizedJoin: String,
    onNavigateToRoom: (String) -> Unit,
    onJoinInputChange: (String) -> Unit,
    onGenerateRoomId: () -> String,
    createRoomFocusRequester: FocusRequester,
    joinInputFocusRequester: FocusRequester
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 64.dp, vertical = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        // Branding - Centered and prominent
        Row(
            horizontalArrangement = Arrangement.spacedBy(20.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(text = "🍿", style = TextStyle(fontSize = 72.sp))
            Text(
                text = "Huddle",
                style = TextStyle(
                    color = Slate50,
                    fontSize = 56.sp,
                    fontWeight = FontWeight.Bold
                )
            )
        }
        
        Spacer(Modifier.height(16.dp))
        
        Text(
            text = "Watch videos together with friends",
            style = TextStyle(
                color = Slate400,
                fontSize = 24.sp
            )
        )
        
        Spacer(Modifier.height(48.dp))
        
        // Main actions - Side by side cards
        Row(
            modifier = Modifier.widthIn(max = 900.dp),
            horizontalArrangement = Arrangement.spacedBy(32.dp)
        ) {
            // Quick Actions Card
            TvCard(
                modifier = Modifier.weight(1f)
            ) {
                Text(
                    text = "Quick Start",
                    style = TextStyle(
                        color = Slate50,
                        fontSize = 22.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                )
                
                Spacer(Modifier.height(20.dp))
                
                // Create new room - Primary action
                TvPrimaryButton(
                    onClick = {
                        val roomId = onGenerateRoomId()
                        onNavigateToRoom(roomId)
                    },
                    modifier = Modifier.fillMaxWidth(),
                    focusRequester = createRoomFocusRequester
                ) {
                    Icon(
                        Icons.Default.Add,
                        contentDescription = null,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(Modifier.width(12.dp))
                    Text(
                        text = "Create New Room",
                        style = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
                    )
                }
                
                // Continue last room
                if (uiState.lastRoomId != null) {
                    Spacer(Modifier.height(16.dp))
                    TvSecondaryButton(
                        onClick = { onNavigateToRoom(uiState.lastRoomId!!) },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(
                            Icons.Default.History,
                            contentDescription = null,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(Modifier.width(12.dp))
                        Text(
                            text = "Continue: ${uiState.lastRoomId}",
                            style = TextStyle(fontWeight = FontWeight.Medium, fontSize = 16.sp)
                        )
                    }
                }
                
                Spacer(Modifier.height(24.dp))
                
                // Join room section
                Text(
                    text = "Join a Room",
                    style = TextStyle(
                        color = Slate400,
                        fontSize = 14.sp
                    )
                )
                Spacer(Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    TvTextField(
                        value = uiState.joinInput,
                        onValueChange = onJoinInputChange,
                        placeholder = "Room name",
                        modifier = Modifier.weight(1f),
                        focusRequester = joinInputFocusRequester
                    )
                    
                    TvSecondaryButton(
                        onClick = {
                            if (normalizedJoin.isNotEmpty()) {
                                onNavigateToRoom(normalizedJoin)
                            }
                        },
                        enabled = normalizedJoin.isNotEmpty()
                    ) {
                        Text(
                            text = "Join",
                            style = TextStyle(fontWeight = FontWeight.Medium, fontSize = 16.sp)
                        )
                    }
                }
            }
            
            // Saved Rooms Card (only if logged in and has rooms)
            if (uiState.authUser != null && uiState.savedRooms.isNotEmpty()) {
                TvCard(
                    modifier = Modifier.weight(1f)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Saved Rooms",
                            style = TextStyle(
                                color = Slate50,
                                fontSize = 22.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        )
                        Icon(
                            Icons.Default.Bookmark,
                            contentDescription = null,
                            tint = Slate400,
                            modifier = Modifier.size(24.dp)
                        )
                    }
                    
                    Spacer(Modifier.height(16.dp))
                    
                    // Show saved rooms as buttons
                    uiState.savedRooms.take(4).forEach { roomId ->
                        TvSecondaryButton(
                            onClick = { onNavigateToRoom(roomId) },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = roomId,
                                style = TextStyle(fontSize = 16.sp)
                            )
                        }
                        Spacer(Modifier.height(8.dp))
                    }
                    
                    if (uiState.savedRooms.size > 4) {
                        Text(
                            text = "+${uiState.savedRooms.size - 4} more",
                            style = TextStyle(
                                color = Slate500,
                                fontSize = 14.sp
                            )
                        )
                    }
                }
            } else if (uiState.authUser == null) {
                // Tips card for non-logged in users
                TvCard(
                    modifier = Modifier.weight(1f)
                ) {
                    Text(
                        text = "TV Tips",
                        style = TextStyle(
                            color = Slate50,
                            fontSize = 22.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    )
                    
                    Spacer(Modifier.height(16.dp))
                    
                    TvTipRow(icon = Icons.Default.Tv, text = "Use D-pad to navigate")
                    Spacer(Modifier.height(12.dp))
                    TvTipRow(icon = Icons.Default.PlayArrow, text = "Press OK/Enter to select")
                    Spacer(Modifier.height(12.dp))
                    TvTipRow(icon = Icons.Default.PhoneAndroid, text = "Load videos from your phone")
                    Spacer(Modifier.height(12.dp))
                    TvTipRow(icon = Icons.Default.Share, text = "Share room code with friends")
                }
            }
        }
    }
}

@Composable
private fun TvTipRow(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Icon(
            icon,
            contentDescription = null,
            tint = Slate400,
            modifier = Modifier.size(20.dp)
        )
        Text(
            text = text,
            style = TextStyle(
                color = Slate400,
                fontSize = 16.sp
            )
        )
    }
}

@Composable
private fun MobileHomeContent(
    uiState: HomeUiState,
    normalizedJoin: String,
    onNavigateToRoom: (String) -> Unit,
    onJoinInputChange: (String) -> Unit,
    onGenerateRoomId: () -> String,
    createRoomFocusRequester: FocusRequester,
    joinInputFocusRequester: FocusRequester,
    isTV: Boolean
) {
    val cardComponent: @Composable (content: @Composable ColumnScope.() -> Unit) -> Unit = { content ->
        if (isTV) {
            TvCard(modifier = Modifier.widthIn(max = 500.dp), content = content)
        } else {
            GlassCard(modifier = Modifier.widthIn(max = 400.dp), content = content)
        }
    }
    
    cardComponent {
        // Title
        Text(
            text = "Create or join a room",
            style = TextStyle(
                color = Slate50,
                fontSize = if (isTV) 24.sp else 18.sp,
                fontWeight = FontWeight.SemiBold
            )
        )
        
        Spacer(Modifier.height(4.dp))
        
        Text(
            text = "Rooms are just URLs you can share with friends.",
            style = TextStyle(
                color = Slate400,
                fontSize = if (isTV) 18.sp else 14.sp
            )
        )
        
        Spacer(Modifier.height(if (isTV) 32.dp else 20.dp))

        // Saved rooms (when logged in)
        if (uiState.authUser != null) {
            SavedRoomsSection(
                savedRooms = uiState.savedRooms,
                isLoading = uiState.isLoading,
                error = uiState.error,
                onNavigateToRoom = onNavigateToRoom,
                isTV = isTV
            )
            Spacer(Modifier.height(if (isTV) 20.dp else 12.dp))
        }
        
        // Continue last room button
        if (uiState.lastRoomId != null) {
            if (isTV) {
                TvSecondaryButton(
                    onClick = { onNavigateToRoom(uiState.lastRoomId!!) },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "Continue last room",
                        style = TextStyle(fontWeight = FontWeight.SemiBold)
                    )
                }
            } else {
                HuddleSecondaryButton(
                    onClick = { onNavigateToRoom(uiState.lastRoomId!!) },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "Continue last room",
                        style = TextStyle(fontWeight = FontWeight.SemiBold)
                    )
                }
            }
            Spacer(Modifier.height(12.dp))
        }
        
        // Create new room button
        if (isTV) {
            TvPrimaryButton(
                onClick = {
                    val roomId = onGenerateRoomId()
                    onNavigateToRoom(roomId)
                },
                modifier = Modifier.fillMaxWidth(),
                focusRequester = createRoomFocusRequester
            ) {
                Text(
                    text = "Create a new room",
                    style = TextStyle(fontWeight = FontWeight.SemiBold)
                )
            }
        } else {
            HuddlePrimaryButton(
                onClick = {
                    val roomId = onGenerateRoomId()
                    onNavigateToRoom(roomId)
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = "Create a new room",
                    style = TextStyle(fontWeight = FontWeight.SemiBold)
                )
            }
        }
        
        Spacer(Modifier.height(12.dp))
        
        // Join room input
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            if (isTV) {
                TvTextField(
                    value = uiState.joinInput,
                    onValueChange = onJoinInputChange,
                    placeholder = "Enter room name or paste invite link",
                    modifier = Modifier.weight(1f),
                    focusRequester = joinInputFocusRequester
                )
                
                TvSecondaryButton(
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
            } else {
                HuddleTextField(
                    value = uiState.joinInput,
                    onValueChange = onJoinInputChange,
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

@Composable
private fun SavedRoomsSection(
    savedRooms: List<String>,
    isLoading: Boolean,
    error: String?,
    onNavigateToRoom: (String) -> Unit,
    isTV: Boolean
) {
    val textSize = if (isTV) 18.sp else 14.sp
    val smallTextSize = if (isTV) 16.sp else 12.sp
    
    Text(
        text = "Saved rooms",
        style = TextStyle(
            color = Slate50,
            fontSize = textSize,
            fontWeight = FontWeight.SemiBold
        )
    )
    Spacer(Modifier.height(if (isTV) 16.dp else 10.dp))

    if (isLoading) {
        Text(
            text = "Loading...",
            style = TextStyle(
                color = Slate400,
                fontSize = smallTextSize
            )
        )
        Spacer(Modifier.height(8.dp))
    }

    if (!error.isNullOrBlank()) {
        Text(
            text = error,
            style = TextStyle(
                color = Slate400,
                fontSize = smallTextSize
            )
        )
        Spacer(Modifier.height(8.dp))
    }

    if (savedRooms.isEmpty() && !isLoading) {
        Text(
            text = "No saved rooms yet",
            style = TextStyle(
                color = Slate400,
                fontSize = smallTextSize
            )
        )
        Spacer(Modifier.height(8.dp))
    } else {
        savedRooms.forEach { roomId ->
            if (isTV) {
                TvSecondaryButton(
                    onClick = { onNavigateToRoom(roomId) },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = roomId,
                        style = TextStyle(fontWeight = FontWeight.Medium)
                    )
                }
            } else {
                HuddleSecondaryButton(
                    onClick = { onNavigateToRoom(roomId) },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = roomId,
                        style = TextStyle(fontWeight = FontWeight.Medium)
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
private fun HomeHeader(
    authUsername: String?,
    onLogin: () -> Unit,
    onRegister: () -> Unit,
    onLogout: () -> Unit,
    isTV: Boolean = false
) {
    val horizontalPadding = if (isTV) 48.dp else 24.dp
    val verticalPadding = if (isTV) 24.dp else 16.dp
    val logoSize = if (isTV) 32.sp else 24.sp
    val titleSize = if (isTV) 28.sp else 20.sp
    
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = Black30,
        shadowElevation = 0.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = horizontalPadding, vertical = verticalPadding),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(if (isTV) 12.dp else 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "🍿",
                    style = TextStyle(fontSize = logoSize)
                )
                Text(
                    text = "Huddle",
                    style = TextStyle(
                        color = Slate50,
                        fontSize = titleSize,
                        fontWeight = FontWeight.SemiBold,
                        letterSpacing = (-0.5).sp
                    )
                )
            }

            Row(
                horizontalArrangement = Arrangement.spacedBy(if (isTV) 12.dp else 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (authUsername.isNullOrBlank()) {
                    if (isTV) {
                        TvSecondaryButton(onClick = onLogin) { 
                            Text("Log in", fontSize = if (isTV) 16.sp else 14.sp) 
                        }
                        TvSecondaryButton(onClick = onRegister) { 
                            Text("Register", fontSize = if (isTV) 16.sp else 14.sp) 
                        }
                    } else {
                        HuddleSecondaryButton(onClick = onLogin) { Text("Log in") }
                        HuddleSecondaryButton(onClick = onRegister) { Text("Register") }
                    }
                } else {
                    Text(
                        text = "@${authUsername}",
                        style = TextStyle(
                            color = Slate200,
                            fontSize = if (isTV) 18.sp else 13.sp,
                            fontWeight = FontWeight.Medium
                        )
                    )
                    if (isTV) {
                        TvSecondaryButton(onClick = onLogout) { 
                            Text("Logout", fontSize = 16.sp) 
                        }
                    } else {
                        HuddleSecondaryButton(onClick = onLogout) { Text("Logout") }
                    }
                }
            }
        }
    }
}
