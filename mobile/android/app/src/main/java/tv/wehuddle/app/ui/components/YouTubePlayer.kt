package tv.wehuddle.app.ui.components

import android.annotation.SuppressLint
import android.graphics.Color
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.delay
import tv.wehuddle.app.data.model.extractYoutubeVideoId
import tv.wehuddle.app.ui.theme.*

/**
 * YouTube video player using WebView and YouTube IFrame API
 * Provides full playback control and sync capabilities
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun YouTubePlayerView(
    url: String,
    isPlaying: Boolean,
    currentTime: Double,
    volume: Float,
    isMuted: Boolean,
    playbackSpeed: Float,
    onPlay: () -> Unit,
    onPause: () -> Unit,
    onSeek: (Double) -> Unit,
    onProgress: (Double, Double) -> Unit,
    onReady: () -> Unit,
    onError: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val videoId = remember(url) { extractYoutubeVideoId(url) }
    
    var isLoading by remember { mutableStateOf(true) }
    var playerReady by remember { mutableStateOf(false) }
    var lastSeekTime by remember { mutableDoubleStateOf(-1.0) }
    var lastPlayerTime by remember { mutableDoubleStateOf(-1.0) }
    var lastReportedTime by remember { mutableDoubleStateOf(-1.0) }  // Track our own progress reports
    var lastReportedTimeMs by remember { mutableLongStateOf(0L) }  // When we reported (for feedback detection)
    var isUserSeeking by remember { mutableStateOf(false) }
    var hasError by remember { mutableStateOf(false) }
    
    // WebView instance
    val webView = remember {
        WebView(context).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.BLACK)
            
            settings.apply {
                javaScriptEnabled = true
                mediaPlaybackRequiresUserGesture = false
                domStorageEnabled = true
                loadWithOverviewMode = true
                useWideViewPort = true
                cacheMode = WebSettings.LOAD_DEFAULT
                mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                // Additional settings for stability
                allowFileAccess = false
                allowContentAccess = false
                setSupportZoom(false)
                builtInZoomControls = false
                displayZoomControls = false
            }
            
            // Enhanced WebChromeClient for media permissions
            // IMPORTANT: Block YouTube's native fullscreen - we handle fullscreen in our app
            webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(consoleMessage: android.webkit.ConsoleMessage?): Boolean {
                    // Log console messages for debugging
                    if (consoleMessage != null) {
                        android.util.Log.d("WebView", "Console: ${consoleMessage.message()}")
                    }
                    return true
                }
                
                override fun onPermissionRequest(request: android.webkit.PermissionRequest?) {
                    if (request != null) {
                        // Grant all requested permissions
                        request.grant(request.resources)
                    }
                }
                
                // Block YouTube's native fullscreen - we use our own fullscreen overlay
                override fun onShowCustomView(view: android.view.View?, callback: CustomViewCallback?) {
                    // Do nothing - block native fullscreen
                    android.util.Log.d("YouTubePlayer", "Blocked YouTube native fullscreen request")
                    callback?.onCustomViewHidden()
                }
                
                override fun onHideCustomView() {
                    // Do nothing
                }
            }
            
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    isLoading = false
                }
                
                override fun onReceivedError(
                    view: WebView?,
                    request: android.webkit.WebResourceRequest?,
                    error: android.webkit.WebResourceError?
                ) {
                    // Only handle main frame errors
                    if (request?.isForMainFrame == true) {
                        hasError = true
                        onError("Failed to load YouTube player")
                    }
                }
                
                override fun shouldOverrideUrlLoading(view: WebView?, request: android.webkit.WebResourceRequest?): Boolean {
                    // Prevent navigation away from the player
                    return request?.url?.host?.contains("youtube.com") != true
                }
            }
            
            // Prevent WebView crashes
            setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null)
        }
    }
    
    // JavaScript interface for communication
    val jsInterface = remember {
        object {
            @JavascriptInterface
            fun onPlayerReady() {
                playerReady = true
                onReady()
            }
            
            @JavascriptInterface
            fun onPlayerStateChange(state: Int) {
                // YouTube player states:
                // -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (video cued)
                // IMPORTANT:
                // Do NOT call onPlay/onPause from here.
                // Those callbacks send sync events to the server.
                // If we echo server-driven play/pause back to the server, the room can get stuck
                // repeatedly resetting to timestamp=0.
            }
            
            @JavascriptInterface
            fun onTimeUpdate(currentTimeSeconds: Double, durationSeconds: Double) {
                lastPlayerTime = currentTimeSeconds
                if (!isUserSeeking) {
                    // Track what and when we report to avoid feedback loop
                    lastReportedTime = currentTimeSeconds
                    lastReportedTimeMs = System.currentTimeMillis()
                    onProgress(currentTimeSeconds, durationSeconds)
                }
            }
            
            @JavascriptInterface
            fun onPlayerError(errorCode: Int) {
                val errorMessage = when (errorCode) {
                    2 -> "Invalid video ID"
                    5 -> "HTML5 player error"
                    100 -> "Video not found"
                    101, 150 -> "Video not allowed to be embedded"
                    152 -> "This video cannot be played (region/embedding restrictions)"
                    else -> "YouTube player error (code $errorCode)"
                }
                android.util.Log.e("YouTubePlayer", "Player error: $errorMessage (code: $errorCode)")
                onError(errorMessage)
            }
        }
    }
    
    // Add JavaScript interface
    LaunchedEffect(webView) {
        webView.addJavascriptInterface(jsInterface, "Android")
    }
    
    // Load YouTube player HTML when video ID changes
    LaunchedEffect(videoId) {
        if (videoId != null) {
            isLoading = true
            playerReady = false
            android.util.Log.d("YouTubePlayer", "Loading video ID: $videoId from URL: $url")
            val html = createYouTubePlayerHtml(videoId)
            webView.loadDataWithBaseURL(
                "https://wehuddle.tv",  // <--- CHANGED FROM youtube.com
                html,
                "text/html",
                "UTF-8",
                null
            )
        }
    }
    
    // Handle play/pause
    LaunchedEffect(isPlaying, playerReady) {
        if (!playerReady) return@LaunchedEffect
        
        val command = if (isPlaying) "playVideo" else "pauseVideo"
        webView.evaluateJavascript("try { $command(); } catch(e) {}", null)
    }
    
    // Handle seek from server (with improved drift protection)
    LaunchedEffect(currentTime, playerReady) {
        if (!playerReady || currentTime < 0) {
            android.util.Log.d("YouTubePlayer", "Seek skipped: playerReady=$playerReady, currentTime=$currentTime")
            return@LaunchedEffect
        }

        // If the desired time already matches the player's current time, don't seek.
        val playerTime = lastPlayerTime
        val playerDelta = if (playerTime >= 0) kotlin.math.abs(currentTime - playerTime) else Double.MAX_VALUE
        
        // CRITICAL: Only consider it "own feedback" if:
        // 1. The time matches what we recently reported (within 2s)
        // 2. The report was very recent (within 2000ms) - older reports are stale
        val timeSinceReport = System.currentTimeMillis() - lastReportedTimeMs
        val isRecentReport = timeSinceReport < 2000
        val isOwnFeedback = isRecentReport && kotlin.math.abs(currentTime - lastReportedTime) < 2.0
        
        // Only skip seek if BOTH conditions are true:
        // 1. Looks like our own feedback (close to last report AND report was recent)
        // 2. Player position is close to target (no actual drift)
        if (isOwnFeedback && playerDelta < 2.0) {
            android.util.Log.d("YouTubePlayer", "Seek skipped: own feedback, delta=$playerDelta, sincereport=${timeSinceReport}ms")
            return@LaunchedEffect
        }
        
        // Check if this is a sync event (significant jump from last seek)
        val isSync = kotlin.math.abs(currentTime - lastSeekTime) > 2.0
        
        // Seek if:
        // 1. Difference from player position is very significant (>3s) OR
        // 2. This is clearly a sync event AND there's noticeable drift (>1.5s)
        val shouldSeek = playerDelta > 3.0 || (isSync && playerDelta > 1.5)
        
        if (!shouldSeek) {
            android.util.Log.d("YouTubePlayer", "Seek skipped: shouldSeek=false, delta=$playerDelta, isSync=$isSync")
            return@LaunchedEffect
        }
        
        android.util.Log.d("YouTubePlayer", "Seeking: target=${currentTime}s, player=${playerTime}s, delta=${playerDelta}s, isSync=$isSync")
        
        // Mark as seeking to prevent reporting this seek back to server
        isUserSeeking = true
        lastSeekTime = currentTime
        
        webView.evaluateJavascript(
            "try { seekTo($currentTime); } catch(e) {}",
            null
        )
        
        // Reset user seeking flag after a delay
        delay(300)
        isUserSeeking = false
    }
    
    // Handle volume
    LaunchedEffect(volume, isMuted, playerReady) {
        if (!playerReady) return@LaunchedEffect
        
        val volumePercent = if (isMuted) 0 else (volume * 100).toInt().coerceIn(0, 100)
        val muteCmd = if (isMuted) "mute" else "unMute"
        webView.evaluateJavascript(
            "try { setVolume($volumePercent); $muteCmd(); } catch(e) {}",
            null
        )
    }

    // Handle playback speed
    LaunchedEffect(playbackSpeed, playerReady) {
        if (!playerReady) return@LaunchedEffect
        val safeSpeed = playbackSpeed.coerceIn(0.25f, 2f)
        webView.evaluateJavascript(
            "try { setPlaybackRate($safeSpeed); } catch(e) {}",
            null
        )
    }
    
    // Cleanup
    DisposableEffect(Unit) {
        onDispose {
            webView.destroy()
        }
    }
    
    Box(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(16f / 9f)
            .clip(RoundedCornerShape(12.dp))
            .background(Slate900)
    ) {
        when {
            videoId == null -> {
                // Invalid YouTube URL
                Column(
                    modifier = Modifier.fillMaxSize(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Text(
                        text = "Invalid YouTube URL",
                        style = TextStyle(color = Slate400, fontSize = 14.sp)
                    )
                }
            }
            hasError -> {
                // Error loading player
                Column(
                    modifier = Modifier.fillMaxSize(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Text(
                        text = "Failed to load YouTube video",
                        style = TextStyle(color = Slate400, fontSize = 14.sp)
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Video ID: $videoId",
                        style = TextStyle(color = Slate500, fontSize = 12.sp)
                    )
                }
            }
            else -> {
                AndroidView(
                    factory = { webView },
                    modifier = Modifier.fillMaxSize()
                )
                
                // Loading overlay
                if (isLoading) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Slate900.copy(alpha = 0.8f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            CircularProgressIndicator(color = Slate300)
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = "Loading YouTube...",
                                style = TextStyle(color = Slate400, fontSize = 12.sp)
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * Creates the HTML content for the YouTube IFrame player
 */
private fun createYouTubePlayerHtml(videoId: String): String {
    return """
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <meta name="referrer" content="strict-origin-when-cross-origin">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                html, body { 
                    width: 100%; 
                    height: 100%; 
                    background: #000; 
                    overflow: hidden;
                }
                #player { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
                /* Hide YouTube native controls and overlays */
                .ytp-chrome-top, .ytp-chrome-bottom, .ytp-gradient-top, .ytp-gradient-bottom,
                .ytp-watermark, .ytp-pause-overlay, .ytp-show-cards-title,
                .ytp-ce-element, .ytp-endscreen-content, .ytp-cards-button,
                .ytp-share-button, .ytp-watch-later-button, .ytp-overflow-button,
                .ytp-button[aria-label="Share"], .ytp-button[data-tooltip-target-id="ytp-autonav-toggle-button"],
                .ytp-cued-thumbnail-overlay, .ytp-large-play-button,
                .ytp-title-channel, .ytp-title-text { 
                    display: none !important; 
                    visibility: hidden !important;
                    pointer-events: none !important;
                }
                /* Disable pointer events on overlays */
                iframe { pointer-events: auto; }
            </style>
        </head>
        <body>
            <div id="player"></div>
            <script>
                var tag = document.createElement('script');
                tag.src = "https://www.youtube.com/iframe_api";
                var firstScriptTag = document.getElementsByTagName('script')[0];
                firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
                
                var player;
                var isReady = false;
                
                function onYouTubeIframeAPIReady() {
                    player = new YT.Player('player', {
                        videoId: '$videoId',
                        playerVars: {
                            'playsinline': 1,
                            'controls': 0,
                            'disablekb': 1,
                            'fs': 0,
                            'modestbranding': 1,
                            'rel': 0,
                            'showinfo': 0,
                            'iv_load_policy': 3,
                            'autoplay': 0,
                            'enablejsapi': 1,
                            'cc_load_policy': 0,
                            'autohide': 1,
                            // CRITICAL FIX 3: Must match the loadDataWithBaseURL domain exactly
                            'origin': 'https://wehuddle.tv' 
                        },
                        events: {
                            'onReady': onPlayerReady,
                            'onStateChange': onPlayerStateChange,
                            'onError': onPlayerError
                        }
                    });
                }
                
                function onPlayerReady(event) {
                    isReady = true;
                    try {
                        Android.onPlayerReady();
                    } catch(e) {}
                    startProgressUpdates();
                }
                
                function onPlayerStateChange(event) {
                    try {
                        Android.onPlayerStateChange(event.data);
                    } catch(e) {}
                }
                
                function onPlayerError(event) {
                    try {
                        Android.onPlayerError(event.data);
                    } catch(e) {}
                }
                
                function startProgressUpdates() {
                    setInterval(function() {
                        if (!isReady || !player) return;
                        try {
                            if (player.getCurrentTime && player.getDuration) {
                                Android.onTimeUpdate(player.getCurrentTime(), player.getDuration());
                            }
                        } catch(e) {}
                    }, 500);
                }
                
                function playVideo() {
                    try {
                        if (isReady && player && player.playVideo) player.playVideo();
                    } catch(e) {}
                }
                
                function pauseVideo() {
                    try {
                        if (isReady && player && player.pauseVideo) player.pauseVideo();
                    } catch(e) {}
                }
                
                function seekTo(seconds) {
                    try {
                        if (isReady && player && player.seekTo) player.seekTo(seconds, true);
                    } catch(e) {}
                }
                
                function setVolume(volume) {
                    try {
                        if (isReady && player && player.setVolume) player.setVolume(volume);
                    } catch(e) {}
                }

                function setPlaybackRate(rate) {
                    try {
                        if (isReady && player && player.setPlaybackRate) player.setPlaybackRate(rate);
                    } catch(e) {}
                }
                
                function mute() {
                    try {
                        if (isReady && player && player.mute) player.mute();
                    } catch(e) {}
                }
                
                function unMute() {
                    try {
                        if (isReady && player && player.unMute) player.unMute();
                    } catch(e) {}
                }
            </script>
        </body>
        </html>
    """.trimIndent()
}
