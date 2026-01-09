package tv.wehuddle.app.ui.screens.room.components

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import tv.wehuddle.app.data.model.Playlist
import tv.wehuddle.app.data.model.PlaylistItem
import tv.wehuddle.app.data.model.PlaylistSettings
import tv.wehuddle.app.data.model.extractYoutubeVideoId
import tv.wehuddle.app.data.model.canonicalizeTwitchUrl
import tv.wehuddle.app.data.model.canonicalizeKickUrl
import tv.wehuddle.app.data.model.VideoInfoFetcher
import tv.wehuddle.app.ui.components.InAppVideoSource
import tv.wehuddle.app.ui.components.InAppVideoBrowserDialog
import tv.wehuddle.app.ui.theme.*
import kotlinx.coroutines.launch

/**
 * Format duration in seconds to MM:SS or HH:MM:SS
 */
private fun formatDuration(seconds: Double?): String {
    if (seconds == null || !seconds.isFinite()) return ""
    val totalSeconds = seconds.toInt()
    val h = totalSeconds / 3600
    val m = (totalSeconds % 3600) / 60
    val s = totalSeconds % 60
    return if (h > 0) {
        "%d:%02d:%02d".format(h, m, s)
    } else {
        "%d:%02d".format(m, s)
    }
}

@Composable
fun PlaylistPanel(
    playlists: List<Playlist>,
    activePlaylistId: String?,
    currentItemIndex: Int,
    currentVideoUrl: String?,
    isOpen: Boolean,
    onClose: () -> Unit,
    onCreatePlaylist: (name: String, description: String?) -> Unit,
    onUpdatePlaylist: (playlistId: String, name: String?, description: String?, settings: PlaylistSettings?) -> Unit,
    onDeletePlaylist: (playlistId: String) -> Unit,
    onAddItem: (playlistId: String, videoUrl: String, title: String?, duration: Double?, thumbnail: String?) -> Unit,
    onRemoveItem: (playlistId: String, itemId: String) -> Unit,
    onSetActive: (playlistId: String?) -> Unit,
    onPlayItem: (playlistId: String, itemId: String) -> Unit,
    onPlayNext: () -> Unit,
    onPlayPrevious: () -> Unit,
    modifier: Modifier = Modifier
) {
    val scope = rememberCoroutineScope()
    
    var selectedPlaylistId by remember(playlists) { 
        mutableStateOf(playlists.firstOrNull()?.id)
    }
    var isCreating by remember { mutableStateOf(false) }
    var showSettings by remember { mutableStateOf(false) }
    var newPlaylistName by remember { mutableStateOf("") }
    var newPlaylistDesc by remember { mutableStateOf("") }
    
    // Video browser state
    var showAddVideoDialog by remember { mutableStateOf(false) }
    var videoUrlInput by remember { mutableStateOf("") }
    var showVideoBrowser by remember { mutableStateOf(false) }
    var browseSource by remember { mutableStateOf(InAppVideoSource.YOUTUBE) }
    var showSourceMenu by remember { mutableStateOf(false) }
    var isLoadingVideoInfo by remember { mutableStateOf(false) }

    val selectedPlaylist = playlists.find { it.id == selectedPlaylistId }
    val activePlaylist = playlists.find { it.id == activePlaylistId }

    AnimatedVisibility(
        visible = isOpen,
        enter = slideInHorizontally(initialOffsetX = { it }),
        exit = slideOutHorizontally(targetOffsetX = { it })
    ) {
        Surface(
            modifier = modifier
                .fillMaxHeight()
                .widthIn(max = 360.dp),
            shape = RoundedCornerShape(topStart = 20.dp, bottomStart = 20.dp),
            color = Slate900,
            shadowElevation = 16.dp
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                // Header
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Playlists",
                        style = TextStyle(
                            color = Slate50,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    )
                    IconButton(onClick = onClose, modifier = Modifier.size(32.dp)) {
                        Icon(Icons.Default.Close, contentDescription = "Close", tint = Slate400)
                    }
                }

                HorizontalDivider(color = Slate700)

                // Playlist Selector Dropdown
                var expanded by remember { mutableStateOf(false) }
                
                Box(modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { expanded = true },
                        shape = RoundedCornerShape(12.dp),
                        color = Slate800,
                        border = androidx.compose.foundation.BorderStroke(1.dp, Slate700)
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = selectedPlaylist?.name ?: "Select Playlist",
                                style = TextStyle(color = Slate200, fontSize = 14.sp),
                                modifier = Modifier.weight(1f)
                            )
                            Icon(
                                Icons.Default.ArrowDropDown,
                                contentDescription = null,
                                tint = Slate400
                            )
                        }
                    }

                    DropdownMenu(
                        expanded = expanded,
                        onDismissRequest = { expanded = false },
                        modifier = Modifier.background(Slate800)
                    ) {
                        playlists.forEach { playlist ->
                            DropdownMenuItem(
                                text = { 
                                    Text(
                                        playlist.name,
                                        color = if (playlist.id == activePlaylistId) Indigo400 else Slate200
                                    )
                                },
                                onClick = {
                                    selectedPlaylistId = playlist.id
                                    expanded = false
                                },
                                trailingIcon = if (playlist.id == activePlaylistId) {
                                    { Icon(Icons.Default.PlayCircle, null, tint = Indigo400, modifier = Modifier.size(16.dp)) }
                                } else null
                            )
                        }
                        
                        HorizontalDivider(color = Slate700)
                        
                        DropdownMenuItem(
                            text = { Text("Create New Playlist", color = Emerald500) },
                            onClick = {
                                isCreating = true
                                expanded = false
                            },
                            leadingIcon = { Icon(Icons.Default.Add, null, tint = Emerald500) }
                        )
                    }
                }

                // Create Playlist Form
                if (isCreating) {
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                        shape = RoundedCornerShape(12.dp),
                        color = Slate800.copy(alpha = 0.5f),
                        border = androidx.compose.foundation.BorderStroke(1.dp, Slate700)
                    ) {
                        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(
                                value = newPlaylistName,
                                onValueChange = { newPlaylistName = it },
                                placeholder = { Text("Playlist name...", color = Slate500) },
                                modifier = Modifier.fillMaxWidth(),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = Indigo500,
                                    unfocusedBorderColor = Slate700,
                                    focusedTextColor = Slate200,
                                    unfocusedTextColor = Slate200
                                ),
                                shape = RoundedCornerShape(8.dp),
                                singleLine = true,
                                textStyle = TextStyle(fontSize = 14.sp)
                            )
                            
                            OutlinedTextField(
                                value = newPlaylistDesc,
                                onValueChange = { newPlaylistDesc = it },
                                placeholder = { Text("Description (optional)...", color = Slate500) },
                                modifier = Modifier.fillMaxWidth(),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = Indigo500,
                                    unfocusedBorderColor = Slate700,
                                    focusedTextColor = Slate200,
                                    unfocusedTextColor = Slate200
                                ),
                                shape = RoundedCornerShape(8.dp),
                                singleLine = true,
                                textStyle = TextStyle(fontSize = 14.sp)
                            )
                            
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.End,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                TextButton(onClick = { isCreating = false }) {
                                    Text("Cancel", color = Slate400)
                                }
                                Spacer(Modifier.width(8.dp))
                                Button(
                                    onClick = {
                                        if (newPlaylistName.isNotBlank()) {
                                            onCreatePlaylist(newPlaylistName, newPlaylistDesc.takeIf { it.isNotBlank() })
                                            newPlaylistName = ""
                                            newPlaylistDesc = ""
                                            isCreating = false
                                        }
                                    },
                                    enabled = newPlaylistName.isNotBlank(),
                                    colors = ButtonDefaults.buttonColors(containerColor = Indigo500)
                                ) {
                                    Text("Create")
                                }
                            }
                        }
                    }
                }

                // Playback Controls (when playlist is active)
                if (activePlaylist != null && activePlaylist.id == selectedPlaylistId) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        IconButton(onClick = onPlayPrevious) {
                            Icon(Icons.Default.SkipPrevious, "Previous", tint = Slate200)
                        }
                        Spacer(Modifier.width(16.dp))
                        
                        // Now playing indicator
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier.weight(1f)
                        ) {
                            Text(
                                text = "Now Playing",
                                style = TextStyle(color = Slate400, fontSize = 10.sp)
                            )
                            Text(
                                text = activePlaylist.items.getOrNull(currentItemIndex)?.title ?: "—",
                                style = TextStyle(color = Slate200, fontSize = 12.sp, fontWeight = FontWeight.Medium),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                        
                        Spacer(Modifier.width(16.dp))
                        IconButton(onClick = onPlayNext) {
                            Icon(Icons.Default.SkipNext, "Next", tint = Slate200)
                        }
                    }
                    HorizontalDivider(color = Slate700)
                }

                // Playlist Actions
                if (selectedPlaylist != null) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        // Set as Active Button
                        OutlinedButton(
                            onClick = { 
                                if (activePlaylistId == selectedPlaylist.id) {
                                    onSetActive(null)
                                } else {
                                    onSetActive(selectedPlaylist.id)
                                }
                            },
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.outlinedButtonColors(
                                contentColor = if (activePlaylistId == selectedPlaylist.id) Indigo400 else Slate200
                            ),
                            border = androidx.compose.foundation.BorderStroke(
                                1.dp, 
                                if (activePlaylistId == selectedPlaylist.id) Indigo400 else Slate700
                            )
                        ) {
                            Icon(
                                if (activePlaylistId == selectedPlaylist.id) Icons.Default.Stop else Icons.Default.PlayArrow,
                                null,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(Modifier.width(4.dp))
                            Text(
                                if (activePlaylistId == selectedPlaylist.id) "Deactivate" else "Activate",
                                fontSize = 12.sp
                            )
                        }

                        // Add Video Button - opens dialog with browse options
                        OutlinedButton(
                            onClick = { showAddVideoDialog = true },
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Emerald500),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Emerald500.copy(alpha = 0.5f))
                        ) {
                            Icon(Icons.Default.Add, null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Add Video", fontSize = 12.sp)
                        }
                    }
                }

                // Items List
                if (selectedPlaylist != null) {
                    LazyColumn(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxWidth(),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        if (selectedPlaylist.items.isEmpty()) {
                            item {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(32.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                        Icon(
                                            Icons.Default.QueueMusic,
                                            contentDescription = null,
                                            tint = Slate500,
                                            modifier = Modifier.size(48.dp)
                                        )
                                        Spacer(Modifier.height(8.dp))
                                        Text(
                                            "No videos in playlist",
                                            style = TextStyle(color = Slate400, fontSize = 14.sp)
                                        )
                                        Text(
                                            "Add videos from the player",
                                            style = TextStyle(color = Slate500, fontSize = 12.sp)
                                        )
                                    }
                                }
                            }
                        } else {
                            itemsIndexed(selectedPlaylist.items, key = { _, item -> item.id }) { index, item ->
                                val isActive = activePlaylistId == selectedPlaylist.id && index == currentItemIndex
                                PlaylistItemRow(
                                    item = item,
                                    index = index,
                                    isActive = isActive,
                                    onPlay = { onPlayItem(selectedPlaylist.id, item.id) },
                                    onRemove = { onRemoveItem(selectedPlaylist.id, item.id) }
                                )
                            }
                        }
                    }
                } else {
                    // No playlist selected
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxWidth(),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(
                                Icons.Default.PlaylistAdd,
                                contentDescription = null,
                                tint = Slate500,
                                modifier = Modifier.size(48.dp)
                            )
                            Spacer(Modifier.height(8.dp))
                            Text(
                                "No playlists yet",
                                style = TextStyle(color = Slate400, fontSize = 14.sp)
                            )
                            Spacer(Modifier.height(16.dp))
                            Button(
                                onClick = { isCreating = true },
                                colors = ButtonDefaults.buttonColors(containerColor = Indigo500)
                            ) {
                                Icon(Icons.Default.Add, null)
                                Spacer(Modifier.width(8.dp))
                                Text("Create Playlist")
                            }
                        }
                    }
                }

                // Settings Footer (for selected playlist)
                if (selectedPlaylist != null) {
                    HorizontalDivider(color = Slate700)
                    
                    // Quick Settings Toggle
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        horizontalArrangement = Arrangement.SpaceEvenly
                    ) {
                        // Loop Toggle
                        SettingChip(
                            icon = Icons.Default.Repeat,
                            label = "Loop",
                            isActive = selectedPlaylist.settings.loop,
                            onClick = {
                                onUpdatePlaylist(
                                    selectedPlaylist.id,
                                    null,
                                    null,
                                    selectedPlaylist.settings.copy(loop = !selectedPlaylist.settings.loop)
                                )
                            }
                        )
                        
                        // Shuffle Toggle
                        SettingChip(
                            icon = Icons.Default.Shuffle,
                            label = "Shuffle",
                            isActive = selectedPlaylist.settings.shuffle,
                            onClick = {
                                onUpdatePlaylist(
                                    selectedPlaylist.id,
                                    null,
                                    null,
                                    selectedPlaylist.settings.copy(shuffle = !selectedPlaylist.settings.shuffle)
                                )
                            }
                        )
                        
                        // Auto-Play Toggle
                        SettingChip(
                            icon = Icons.Default.PlayCircleOutline,
                            label = "Auto",
                            isActive = selectedPlaylist.settings.autoPlay,
                            onClick = {
                                onUpdatePlaylist(
                                    selectedPlaylist.id,
                                    null,
                                    null,
                                    selectedPlaylist.settings.copy(autoPlay = !selectedPlaylist.settings.autoPlay)
                                )
                            }
                        )
                        
                        // Delete Button
                        SettingChip(
                            icon = Icons.Default.Delete,
                            label = "Delete",
                            isActive = false,
                            tint = Rose500,
                            onClick = { onDeletePlaylist(selectedPlaylist.id) }
                        )
                    }
                }
            }
        }
    }
    
    // Add Video Dialog
    if (showAddVideoDialog && selectedPlaylist != null) {
        AddVideoToPlaylistDialog(
            currentVideoUrl = currentVideoUrl,
            videoUrlInput = videoUrlInput,
            isLoading = isLoadingVideoInfo,
            onVideoUrlInputChange = { videoUrlInput = it },
            onAddUrl = { url ->
                isLoadingVideoInfo = true
                scope.launch {
                    val info = VideoInfoFetcher.fetchVideoInfo(url)
                    onAddItem(selectedPlaylist.id, url, info?.title, info?.duration, info?.thumbnail)
                    videoUrlInput = ""
                    showAddVideoDialog = false
                    isLoadingVideoInfo = false
                }
            },
            onAddCurrentVideo = {
                if (!currentVideoUrl.isNullOrBlank()) {
                    isLoadingVideoInfo = true
                    scope.launch {
                        val info = VideoInfoFetcher.fetchVideoInfo(currentVideoUrl)
                        onAddItem(selectedPlaylist.id, currentVideoUrl, info?.title, info?.duration, info?.thumbnail)
                        showAddVideoDialog = false
                        isLoadingVideoInfo = false
                    }
                }
            },
            onBrowseSource = { source ->
                browseSource = source
                showVideoBrowser = true
                showAddVideoDialog = false
            },
            onDismiss = { 
                showAddVideoDialog = false
                videoUrlInput = ""
            }
        )
    }
    
    // Video Browser Dialog (YouTube, Twitch, Kick)
    if (showVideoBrowser && selectedPlaylist != null) {
        InAppVideoBrowserDialog(
            source = browseSource,
            initialQuery = "",
            onDismiss = { showVideoBrowser = false },
            onSelectUrl = { url ->
                showVideoBrowser = false
                isLoadingVideoInfo = true
                scope.launch {
                    val info = VideoInfoFetcher.fetchVideoInfo(url)
                    onAddItem(selectedPlaylist.id, url, info?.title, info?.duration, info?.thumbnail)
                    isLoadingVideoInfo = false
                }
            }
        )
    }
}

@Composable
private fun PlaylistItemRow(
    item: PlaylistItem,
    index: Int,
    isActive: Boolean,
    onPlay: () -> Unit,
    onRemove: () -> Unit
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onPlay),
        shape = RoundedCornerShape(12.dp),
        color = if (isActive) Indigo500.copy(alpha = 0.2f) else Slate800.copy(alpha = 0.5f),
        border = if (isActive) {
            androidx.compose.foundation.BorderStroke(1.dp, Indigo500.copy(alpha = 0.5f))
        } else {
            androidx.compose.foundation.BorderStroke(1.dp, Color.Transparent)
        }
    ) {
        Row(
            modifier = Modifier.padding(8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Thumbnail
            Box(
                modifier = Modifier
                    .size(56.dp, 32.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .background(Slate700),
                contentAlignment = Alignment.Center
            ) {
                if (item.thumbnail != null) {
                    AsyncImage(
                        model = item.thumbnail,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize()
                    )
                }
                if (isActive) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Color.Black.copy(alpha = 0.5f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            Icons.Default.PlayArrow,
                            contentDescription = null,
                            tint = Indigo400,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
            }

            // Info
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.title,
                    style = TextStyle(
                        color = if (isActive) Slate50 else Slate200,
                        fontSize = 13.sp,
                        fontWeight = if (isActive) FontWeight.Medium else FontWeight.Normal
                    ),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                if (item.duration != null) {
                    Text(
                        text = formatDuration(item.duration),
                        style = TextStyle(color = Slate500, fontSize = 11.sp)
                    )
                }
            }

            // Remove Button
            IconButton(
                onClick = onRemove,
                modifier = Modifier.size(28.dp)
            ) {
                Icon(
                    Icons.Default.Close,
                    contentDescription = "Remove",
                    tint = Slate500,
                    modifier = Modifier.size(16.dp)
                )
            }
        }
    }
}

@Composable
private fun SettingChip(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    isActive: Boolean,
    tint: Color = Indigo400,
    onClick: () -> Unit
) {
    Surface(
        modifier = Modifier.clickable(onClick = onClick),
        shape = RoundedCornerShape(8.dp),
        color = if (isActive) tint.copy(alpha = 0.15f) else Color.Transparent,
        border = if (isActive) {
            androidx.compose.foundation.BorderStroke(1.dp, tint.copy(alpha = 0.3f))
        } else {
            androidx.compose.foundation.BorderStroke(1.dp, Slate700)
        }
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                icon,
                contentDescription = null,
                tint = if (isActive) tint else Slate500,
                modifier = Modifier.size(18.dp)
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = label,
                style = TextStyle(
                    color = if (isActive) tint else Slate500,
                    fontSize = 10.sp,
                    fontWeight = if (isActive) FontWeight.Medium else FontWeight.Normal
                )
            )
        }
    }
}

/**
 * Dialog to add videos to playlist with multiple options:
 * - Paste URL directly
 * - Add current playing video
 * - Browse YouTube, Twitch, Kick
 */
@Composable
private fun AddVideoToPlaylistDialog(
    currentVideoUrl: String?,
    videoUrlInput: String,
    isLoading: Boolean,
    onVideoUrlInputChange: (String) -> Unit,
    onAddUrl: (String) -> Unit,
    onAddCurrentVideo: () -> Unit,
    onBrowseSource: (InAppVideoSource) -> Unit,
    onDismiss: () -> Unit
) {
    val isValidUrl = remember(videoUrlInput) {
        val url = videoUrlInput.trim()
        url.isNotEmpty() && (
            extractYoutubeVideoId(url) != null ||
            canonicalizeTwitchUrl(url) != null ||
            canonicalizeKickUrl(url) != null ||
            url.startsWith("http://") || url.startsWith("https://")
        )
    }
    
    androidx.compose.ui.window.Dialog(onDismissRequest = { if (!isLoading) onDismiss() }) {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp)),
            color = Slate900,
            tonalElevation = 4.dp
        ) {
            Box {
                Column(
                    modifier = Modifier.padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    // Header
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Add Video to Playlist",
                            style = TextStyle(
                                color = Slate50,
                                fontSize = 18.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        )
                        IconButton(onClick = { if (!isLoading) onDismiss() }, modifier = Modifier.size(32.dp)) {
                            Icon(Icons.Default.Close, contentDescription = "Close", tint = Slate400)
                        }
                    }
                    
                    // Add Current Video Button (if a video is playing)
                    if (!currentVideoUrl.isNullOrBlank()) {
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable(enabled = !isLoading, onClick = onAddCurrentVideo),
                            shape = RoundedCornerShape(12.dp),
                            color = Emerald500.copy(alpha = 0.15f),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Emerald500.copy(alpha = 0.3f))
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    Icons.Default.PlayCircle,
                                    contentDescription = null,
                                tint = Emerald500,
                                modifier = Modifier.size(24.dp)
                            )
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = "Add Current Video",
                                    style = TextStyle(color = Emerald500, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                                )
                                Text(
                                    text = currentVideoUrl.take(40) + if (currentVideoUrl.length > 40) "..." else "",
                                    style = TextStyle(color = Slate400, fontSize = 11.sp),
                                    maxLines = 1
                                )
                            }
                            Icon(Icons.Default.Add, contentDescription = null, tint = Emerald500)
                        }
                    }
                }
                
                HorizontalDivider(color = Slate700)
                
                // URL Input
                Text(
                    text = "Paste Video URL",
                    style = TextStyle(color = Slate300, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                )
                
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedTextField(
                        value = videoUrlInput,
                        onValueChange = onVideoUrlInputChange,
                        placeholder = { Text("YouTube, Twitch, Kick, or direct URL...", color = Slate500, fontSize = 13.sp) },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        enabled = !isLoading,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = Indigo500,
                            unfocusedBorderColor = Slate700,
                            focusedTextColor = Slate200,
                            unfocusedTextColor = Slate200,
                            cursorColor = Indigo500
                        ),
                        shape = RoundedCornerShape(10.dp),
                        textStyle = TextStyle(fontSize = 13.sp)
                    )
                    
                    Button(
                        onClick = { onAddUrl(videoUrlInput.trim()) },
                        enabled = isValidUrl && !isLoading,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Indigo500,
                            disabledContainerColor = Slate700
                        ),
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp)
                    ) {
                        Text("Add")
                    }
                }
                
                HorizontalDivider(color = Slate700)
                
                // Browse Options
                Text(
                    text = "Or Browse",
                    style = TextStyle(color = Slate300, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                )
                
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // YouTube
                    BrowseSourceButton(
                        label = "YouTube",
                        icon = Icons.Default.PlayCircle,
                        color = Color(0xFFFF0000),
                        modifier = Modifier.weight(1f),
                        enabled = !isLoading,
                        onClick = { onBrowseSource(InAppVideoSource.YOUTUBE) }
                    )
                    
                    // Twitch
                    BrowseSourceButton(
                        label = "Twitch",
                        icon = Icons.Default.Videocam,
                        color = Color(0xFF9146FF),
                        modifier = Modifier.weight(1f),
                        enabled = !isLoading,
                        onClick = { onBrowseSource(InAppVideoSource.TWITCH) }
                    )
                    
                    // Kick
                    BrowseSourceButton(
                        label = "Kick",
                        icon = Icons.Default.LiveTv,
                        color = Color(0xFF53FC18),
                        modifier = Modifier.weight(1f),
                        enabled = !isLoading,
                        onClick = { onBrowseSource(InAppVideoSource.KICK) }
                    )
                    
                    // Netflix
                    BrowseSourceButton(
                        label = "Netflix",
                        icon = Icons.Default.Movie,
                        color = Color(0xFFE50914),
                        modifier = Modifier.weight(1f),
                        enabled = !isLoading,
                        onClick = { onBrowseSource(InAppVideoSource.NETFLIX) }
                    )
                }
                }
                
                // Loading overlay
                if (isLoading) {
                    Box(
                        modifier = Modifier
                            .matchParentSize()
                            .background(Color.Black.copy(alpha = 0.5f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            CircularProgressIndicator(color = Indigo400)
                            Spacer(Modifier.height(8.dp))
                            Text("Fetching video info...", color = Slate200, fontSize = 12.sp)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun BrowseSourceButton(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    color: Color,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onClick: () -> Unit
) {
    val effectiveColor = if (enabled) color else Slate500
    Surface(
        modifier = modifier.clickable(enabled = enabled, onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        color = effectiveColor.copy(alpha = 0.1f),
        border = androidx.compose.foundation.BorderStroke(1.dp, effectiveColor.copy(alpha = 0.3f))
    ) {
        Column(
            modifier = Modifier.padding(vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Icon(
                icon,
                contentDescription = null,
                tint = effectiveColor,
                modifier = Modifier.size(24.dp)
            )
            Text(
                text = label,
                style = TextStyle(
                    color = effectiveColor,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium
                )
            )
        }
    }
}
