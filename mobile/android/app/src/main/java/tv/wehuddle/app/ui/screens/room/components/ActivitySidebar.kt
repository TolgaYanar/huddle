package tv.wehuddle.app.ui.screens.room.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
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
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun ActivitySidebar(
    logs: List<ActivityLogEntry>,
    chatMessages: List<ChatMessage>,
    chatInput: String,
    userId: String,
    isCollapsed: Boolean,
    onChatInputChange: (String) -> Unit,
    onSendChat: () -> Unit,
    onCollapse: () -> Unit,
    modifier: Modifier = Modifier
) {
    val listState = rememberLazyListState()
    
    // Auto-scroll to bottom when new messages arrive
    LaunchedEffect(logs.size, chatMessages.size) {
        if (logs.isNotEmpty() || chatMessages.isNotEmpty()) {
            listState.animateScrollToItem((logs.size + chatMessages.size).coerceAtLeast(0))
        }
    }
    
    // Merge logs and chat messages for display
    val allItems = remember(logs, chatMessages) {
        val items = mutableListOf<ActivityItem>()
        
        logs.forEach { log ->
            items.add(ActivityItem.LogItem(log))
        }
        
        chatMessages.forEach { message ->
            items.add(ActivityItem.ChatItem(message))
        }
        
        items.sortedBy { item ->
            when (item) {
                is ActivityItem.LogItem -> item.log.timestamp
                is ActivityItem.ChatItem -> parseTimestamp(item.message.createdAt)
            }
        }
    }
    
    GlassCard(modifier = modifier) {
        // Header
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top
        ) {
            Column {
                Text(
                    text = "Activity",
                    style = TextStyle(
                        color = Slate50,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "What's happening in the room and chat.",
                    style = TextStyle(
                        color = Slate400,
                        fontSize = 12.sp
                    )
                )
            }
            
            HuddleSmallButton(onClick = onCollapse) {
                Text(
                    text = if (isCollapsed) "Expand" else "Collapse",
                    style = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Medium)
                )
            }
        }
        
        if (!isCollapsed) {
            Spacer(Modifier.height(16.dp))
            
            // Activity list
            LazyColumn(
                state = listState,
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
            ) {
                items(allItems) { item ->
                    when (item) {
                        is ActivityItem.LogItem -> ActivityLogRow(log = item.log, userId = userId)
                        is ActivityItem.ChatItem -> ChatMessageRow(message = item.message, isOwn = item.message.senderId == userId)
                    }
                }
            }
            
            Spacer(Modifier.height(12.dp))
            
            // Chat input
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                HuddleTextField(
                    value = chatInput,
                    onValueChange = onChatInputChange,
                    placeholder = "Type a message…",
                    modifier = Modifier.weight(1f)
                )
                
                IconButton(
                    onClick = onSendChat,
                    enabled = chatInput.isNotBlank(),
                    modifier = Modifier
                        .size(44.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(if (chatInput.isNotBlank()) Indigo500 else White5)
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.Send,
                        contentDescription = "Send",
                        tint = if (chatInput.isNotBlank()) Slate50 else Slate500
                    )
                }
            }
        }
    }
}

sealed class ActivityItem {
    data class LogItem(val log: ActivityLogEntry) : ActivityItem()
    data class ChatItem(val message: ChatMessage) : ActivityItem()
}

@Composable
private fun ActivityLogRow(
    log: ActivityLogEntry,
    userId: String,
    modifier: Modifier = Modifier
) {
    val icon = when (log.kind) {
        ActivityLogKind.JOIN -> Icons.Default.Login
        ActivityLogKind.LEAVE -> Icons.Default.Logout
        ActivityLogKind.PLAY -> Icons.Default.PlayArrow
        ActivityLogKind.PAUSE -> Icons.Default.Pause
        ActivityLogKind.SEEK -> Icons.Default.FastForward
        ActivityLogKind.URL_CHANGE -> Icons.Default.Link
        ActivityLogKind.CHAT -> Icons.Default.Chat
        ActivityLogKind.SYSTEM -> Icons.Default.Info
    }
    
    val iconColor = when (log.kind) {
        ActivityLogKind.JOIN -> Emerald500
        ActivityLogKind.LEAVE -> Rose500
        ActivityLogKind.PLAY -> Emerald500
        ActivityLogKind.PAUSE -> Amber500
        ActivityLogKind.SEEK -> Indigo400
        ActivityLogKind.URL_CHANGE -> Indigo400
        ActivityLogKind.CHAT -> Slate400
        ActivityLogKind.SYSTEM -> Slate500
    }
    
    val isOwn = log.senderId == userId
    val senderLabel = when {
        isOwn -> "You"
        !log.senderName.isNullOrBlank() -> log.senderName
        log.senderId != null -> log.senderId.take(8)
        else -> "System"
    }
    
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = iconColor,
            modifier = Modifier.size(16.dp)
        )
        
        Text(
            text = senderLabel,
            style = TextStyle(
                color = if (isOwn) Indigo400 else Slate300,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium
            )
        )
        
        Text(
            text = log.message,
            style = TextStyle(
                color = Slate400,
                fontSize = 12.sp
            ),
            modifier = Modifier.weight(1f)
        )
        
        Text(
            text = formatTimestamp(log.timestamp),
            style = TextStyle(
                color = Slate500,
                fontSize = 10.sp
            )
        )
    }
}

@Composable
private fun ChatMessageRow(
    message: ChatMessage,
    isOwn: Boolean,
    modifier: Modifier = Modifier
) {
    val senderLabel = if (isOwn) {
        "You"
    } else {
        message.senderUsername?.takeIf { it.isNotBlank() } ?: message.senderId.take(8)
    }
    
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(if (isOwn) Indigo500.copy(alpha = 0.1f) else Black20)
            .border(1.dp, if (isOwn) Indigo500.copy(alpha = 0.3f) else White10, RoundedCornerShape(12.dp))
            .padding(12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = senderLabel,
                style = TextStyle(
                    color = if (isOwn) Indigo400 else Slate300,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium
                )
            )
            Text(
                text = formatTimestamp(parseTimestamp(message.createdAt)),
                style = TextStyle(
                    color = Slate500,
                    fontSize = 10.sp
                )
            )
        }
        
        Spacer(Modifier.height(4.dp))
        
        Text(
            text = message.text,
            style = TextStyle(
                color = Slate200,
                fontSize = 14.sp
            )
        )
    }
}

private fun formatTimestamp(timestamp: Long): String {
    val formatter = SimpleDateFormat("HH:mm", Locale.getDefault())
    return formatter.format(Date(timestamp))
}

private fun parseTimestamp(dateString: String): Long {
    return try {
        java.time.Instant.parse(dateString).toEpochMilli()
    } catch (e: Exception) {
        System.currentTimeMillis()
    }
}
