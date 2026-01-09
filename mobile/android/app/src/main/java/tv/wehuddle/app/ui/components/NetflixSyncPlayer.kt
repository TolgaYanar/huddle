package tv.wehuddle.app.ui.components

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.util.Log
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

private const val TAG = "NetflixSyncPlayer"
private const val NETFLIX_PACKAGE = "com.netflix.mediaclient"

/**
 * Netflix Sync Player - Shows sync controls after user selects content from Netflix browser
 * Opens the Netflix app for actual playback (DRM support)
 */
@Composable
fun NetflixSyncPlayer(
    url: String,
    isPlaying: Boolean,
    currentTime: Double,
    volume: Float,
    isMuted: Boolean,
    playbackSpeed: Float,
    onProgress: (currentTime: Double, duration: Double) -> Unit,
    onPlayPause: (Boolean) -> Unit,
    onReady: () -> Unit,
    onError: (String) -> Unit,
    modifier: Modifier = Modifier,
    lastRemoteSyncAt: Long = 0L,
    onUrlChange: ((String) -> Unit)? = null
) {
    val context = LocalContext.current
    // Check each time - don't cache in case user installs Netflix mid-session
    val isNetflixInstalled = isNetflixAppInstalled(context)
    var syncCountdown by remember { mutableStateOf<Int?>(null) }
    var localTime by remember { mutableStateOf(currentTime) }
    var isSynced by remember { mutableStateOf(false) }
    var hasOpenedNetflix by remember { mutableStateOf(false) }
    
    // Extract watch ID from URL
    val watchId: String? = remember(url) { extractNetflixSyncWatchId(url) }
    
    // Notify ready
    LaunchedEffect(Unit) {
        onReady()
    }
    
    // Sync countdown timer
    LaunchedEffect(syncCountdown) {
        if (syncCountdown != null && syncCountdown!! > 0) {
            delay(1000)
            syncCountdown = syncCountdown!! - 1
        } else if (syncCountdown == 0) {
            isSynced = true
            localTime = currentTime
            syncCountdown = null
        }
    }
    
    // Progress tracking when synced
    LaunchedEffect(isSynced, isPlaying) {
        if (isSynced && isPlaying) {
            while (true) {
                delay(1000)
                localTime += 1.0
                onProgress(localTime, 0.0)
            }
        }
    }
    
    // Update local time from room sync
    LaunchedEffect(currentTime, lastRemoteSyncAt) {
        if (lastRemoteSyncAt > 0 && kotlin.math.abs(currentTime - localTime) > 3) {
            localTime = currentTime
        }
    }
    
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        Color(0xFF0D0D0D),
                        Color(0xFF141414),
                        Color(0xFF0D0D0D)
                    )
                )
            ),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(20.dp),
            modifier = Modifier.padding(24.dp)
        ) {
            // Netflix Logo
            Box(
                modifier = Modifier
                    .background(Color(0xFFE50914), RoundedCornerShape(8.dp))
                    .padding(horizontal = 20.dp, vertical = 10.dp)
            ) {
                Text(
                    "NETFLIX",
                    color = Color.White,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = 2.sp
                )
            }
            
            if (!isNetflixInstalled) {
                // Netflix not installed
                NetflixNotInstalledCard(
                    onInstallClick = { openPlayStore(context) }
                )
            } else if (watchId == null) {
                // No content selected yet - show info
                NoContentSelectedCard()
            } else if (syncCountdown != null) {
                // Countdown in progress
                SyncCountdownCard(
                    countdown = syncCountdown!!,
                    targetTime = formatTime(currentTime)
                )
            } else {
                // Content selected - show play button and sync controls
                ContentSelectedCard(
                    watchId = watchId,
                    isSynced = isSynced,
                    localTime = localTime,
                    roomTime = currentTime,
                    isPlaying = isPlaying,
                    hasOpenedNetflix = hasOpenedNetflix,
                    onOpenNetflix = {
                        launchNetflixContent(context, watchId)
                        hasOpenedNetflix = true
                    },
                    onStartSync = { syncCountdown = 5 },
                    onResync = {
                        isSynced = false
                        syncCountdown = 5
                    },
                    onPlayPause = { onPlayPause(!isPlaying) }
                )
            }
            
            // Instructions
            Text(
                when {
                    !isNetflixInstalled -> "Install Netflix to watch together"
                    watchId == null -> "Select content from the Netflix browser above"
                    !hasOpenedNetflix -> "Tap to open this content in Netflix"
                    !isSynced -> "Start sync countdown, then press play in Netflix at 0"
                    else -> "Keep Netflix open - use these controls to stay in sync"
                },
                color = Color.White.copy(alpha = 0.5f),
                fontSize = 13.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 24.dp)
            )
        }
    }
}

@Composable
private fun NetflixNotInstalledCard(onInstallClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1F1F1F)),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(
            modifier = Modifier.padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Icon(
                Icons.Default.GetApp,
                contentDescription = null,
                tint = Color(0xFFE50914),
                modifier = Modifier.size(48.dp)
            )
            Text("Netflix App Required", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
            Button(
                onClick = onInstallClick,
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFE50914))
            ) {
                Text("Install from Play Store")
            }
        }
    }
}

@Composable
private fun NoContentSelectedCard() {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1F1F1F)),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(
            modifier = Modifier.padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Icon(
                Icons.Default.Search,
                contentDescription = null,
                tint = Color(0xFFE50914),
                modifier = Modifier.size(56.dp)
            )
            Text(
                "Browse Netflix",
                color = Color.White,
                fontSize = 20.sp,
                fontWeight = FontWeight.SemiBold
            )
            Text(
                "Use the Netflix browser to find and select content to watch together",
                color = Color.White.copy(alpha = 0.6f),
                fontSize = 14.sp,
                textAlign = TextAlign.Center
            )
        }
    }
}

@Composable
private fun SyncCountdownCard(countdown: Int, targetTime: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1F1F1F)),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(
            modifier = Modifier.padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text("Get Ready!", color = Color(0xFFE50914), fontSize = 16.sp, fontWeight = FontWeight.Medium)
            
            Box(
                modifier = Modifier
                    .size(100.dp)
                    .clip(CircleShape)
                    .border(4.dp, Color(0xFFE50914), CircleShape)
                    .background(Color.Black),
                contentAlignment = Alignment.Center
            ) {
                Text(countdown.toString(), color = Color.White, fontSize = 56.sp, fontWeight = FontWeight.Bold)
            }
            
            Text("Press PLAY in Netflix at 0", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Medium)
            Text("Sync to: $targetTime", color = Color.White.copy(alpha = 0.5f), fontSize = 14.sp)
        }
    }
}

@Composable
private fun ContentSelectedCard(
    watchId: String,
    isSynced: Boolean,
    localTime: Double,
    roomTime: Double,
    isPlaying: Boolean,
    hasOpenedNetflix: Boolean,
    onOpenNetflix: () -> Unit,
    onStartSync: () -> Unit,
    onResync: () -> Unit,
    onPlayPause: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1F1F1F)),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Content ID badge
            Text(
                "Content ID: $watchId",
                color = Color.White.copy(alpha = 0.5f),
                fontSize = 12.sp
            )
            
            if (!hasOpenedNetflix) {
                // Big play button to open Netflix
                Box(
                    modifier = Modifier
                        .size(80.dp)
                        .clip(CircleShape)
                        .background(Color(0xFFE50914))
                        .clickable(onClick = onOpenNetflix),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        Icons.Default.PlayArrow,
                        contentDescription = "Open in Netflix",
                        tint = Color.White,
                        modifier = Modifier.size(48.dp)
                    )
                }
                Text("Tap to open in Netflix", color = Color.White, fontSize = 14.sp)
            } else {
                // Sync status
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .clip(CircleShape)
                            .background(if (isSynced) Color(0xFF22C55E) else Color(0xFFFACC15))
                    )
                    Text(
                        if (isSynced) "Synced" else "Not Synced",
                        color = Color.White,
                        fontSize = 14.sp
                    )
                }
                
                // Time display
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Your Time", color = Color.White.copy(alpha = 0.5f), fontSize = 11.sp)
                        Text(formatTime(localTime), color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Room Time", color = Color.White.copy(alpha = 0.5f), fontSize = 11.sp)
                        Text(formatTime(roomTime), color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    }
                }
                
                // Drift indicator
                val drift = localTime - roomTime
                if (kotlin.math.abs(drift) > 2) {
                    Text(
                        if (drift > 0) "You're ${formatTime(drift)} ahead" else "You're ${formatTime(-drift)} behind",
                        color = Color(0xFFFACC15),
                        fontSize = 12.sp
                    )
                }
                
                HorizontalDivider(color = Color.White.copy(alpha = 0.1f))
                
                // Control buttons
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly
                ) {
                    // Netflix button
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        IconButton(
                            onClick = onOpenNetflix,
                            modifier = Modifier
                                .size(50.dp)
                                .background(Color(0xFFE50914), CircleShape)
                        ) {
                            Icon(Icons.Default.Tv, contentDescription = "Netflix", tint = Color.White)
                        }
                        Text("Netflix", color = Color.White.copy(alpha = 0.5f), fontSize = 10.sp)
                    }
                    
                    // Play/Pause
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        IconButton(
                            onClick = onPlayPause,
                            modifier = Modifier
                                .size(50.dp)
                                .background(Color(0xFF6366F1), CircleShape)
                        ) {
                            Icon(
                                if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                                contentDescription = if (isPlaying) "Pause" else "Play",
                                tint = Color.White
                            )
                        }
                        Text(if (isPlaying) "Playing" else "Paused", color = Color.White.copy(alpha = 0.5f), fontSize = 10.sp)
                    }
                    
                    // Sync button
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        IconButton(
                            onClick = if (isSynced) onResync else onStartSync,
                            modifier = Modifier
                                .size(50.dp)
                                .background(Color(0xFF22C55E), CircleShape)
                        ) {
                            Icon(Icons.Default.Sync, contentDescription = "Sync", tint = Color.White)
                        }
                        Text(if (isSynced) "Resync" else "Sync", color = Color.White.copy(alpha = 0.5f), fontSize = 10.sp)
                    }
                }
            }
        }
    }
}

private fun isNetflixAppInstalled(context: Context): Boolean {
    // Most reliable method - check if we can get a launch intent
    if (context.packageManager.getLaunchIntentForPackage(NETFLIX_PACKAGE) != null) {
        Log.d(TAG, "Netflix app found via getLaunchIntentForPackage")
        return true
    }
    
    // Fallback - try to resolve Netflix deep link
    val testIntent = Intent(Intent.ACTION_VIEW, Uri.parse("nflx://"))
    val resolveInfo = context.packageManager.resolveActivity(testIntent, PackageManager.MATCH_DEFAULT_ONLY)
    if (resolveInfo != null) {
        Log.d(TAG, "Netflix app found via nflx:// intent resolution")
        return true
    }
    
    Log.d(TAG, "Netflix app not found")
    return false
}

private fun launchNetflixContent(context: Context, watchId: String) {
    try {
        // Deep link directly to content
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("nflx://www.netflix.com/watch/$watchId")).apply {
            setPackage(NETFLIX_PACKAGE)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        Log.d(TAG, "Launched Netflix with watchId: $watchId")
    } catch (e: ActivityNotFoundException) {
        // Fallback to Netflix app
        try {
            val fallbackIntent = context.packageManager.getLaunchIntentForPackage(NETFLIX_PACKAGE)
            fallbackIntent?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            fallbackIntent?.let { context.startActivity(it) }
        } catch (e2: Exception) {
            Toast.makeText(context, "Could not open Netflix", Toast.LENGTH_SHORT).show()
        }
    } catch (e: Exception) {
        Log.e(TAG, "Error launching Netflix", e)
        Toast.makeText(context, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
    }
}

private fun openPlayStore(context: Context) {
    try {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$NETFLIX_PACKAGE"))
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    } catch (e: ActivityNotFoundException) {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$NETFLIX_PACKAGE"))
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }
}

private fun extractNetflixSyncWatchId(url: String): String? {
    if (url.isBlank()) return null
    // Try /watch/ pattern first
    val watchRegex = Regex("""netflix\.com/watch/(\d+)""")
    watchRegex.find(url)?.groupValues?.get(1)?.let { return it }
    // Try /title/ pattern
    val titleRegex = Regex("""netflix\.com/title/(\d+)""")
    titleRegex.find(url)?.groupValues?.get(1)?.let { return it }
    return null
}

private fun formatTime(seconds: Double): String {
    val totalSeconds = seconds.toLong()
    val hours = totalSeconds / 3600
    val minutes = (totalSeconds % 3600) / 60
    val secs = totalSeconds % 60
    return if (hours > 0) {
        String.format("%d:%02d:%02d", hours, minutes, secs)
    } else {
        String.format("%d:%02d", minutes, secs)
    }
}
