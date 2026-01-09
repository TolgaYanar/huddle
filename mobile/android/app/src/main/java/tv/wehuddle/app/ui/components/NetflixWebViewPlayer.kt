package tv.wehuddle.app.ui.components

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.util.Log
import android.view.ViewGroup
import android.webkit.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.delay

private const val TAG = "NetflixWebViewPlayer"

/**
 * JavaScript bridge interface for Netflix player control
 */
class NetflixJsBridge(
    private val onProgress: (currentTime: Double, duration: Double, isPlaying: Boolean) -> Unit,
    private val onReady: () -> Unit,
    private val onError: (String) -> Unit
) {
    @JavascriptInterface
    fun onVideoProgress(currentTime: Double, duration: Double, isPlaying: Boolean) {
        Log.d(TAG, "JS Bridge: progress currentTime=$currentTime, duration=$duration, isPlaying=$isPlaying")
        onProgress(currentTime, duration, isPlaying)
    }
    
    @JavascriptInterface
    fun onVideoReady() {
        Log.d(TAG, "JS Bridge: video ready")
        onReady()
    }
    
    @JavascriptInterface
    fun onVideoError(message: String) {
        Log.e(TAG, "JS Bridge: error - $message")
        onError(message)
    }
    
    @JavascriptInterface
    fun log(message: String) {
        Log.d(TAG, "JS Log: $message")
    }
}

/**
 * Netflix WebView Player that loads Netflix in a WebView and injects
 * JavaScript to control playback and sync with other users.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun NetflixWebViewPlayer(
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
    lastRemoteSyncAt: Long = 0L
) {
    val context = LocalContext.current
    var isLoading by remember { mutableStateOf(true) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var webView by remember { mutableStateOf<WebView?>(null) }
    var isVideoReady by remember { mutableStateOf(false) }
    var lastKnownRemoteSyncAt by remember { mutableStateOf(0L) }
    var lastReportedTime by remember { mutableStateOf(-1.0) }
    var lastAppliedTime by remember { mutableStateOf(-1.0) }
    
    // Track current playback state from Netflix
    var netflixCurrentTime by remember { mutableStateOf(0.0) }
    var netflixDuration by remember { mutableStateOf(0.0) }
    var netflixIsPlaying by remember { mutableStateOf(false) }
    
    // JavaScript to inject into Netflix page to control the video player
    val controlScript = """
        (function() {
            if (window.huddleNetflixInjected) return;
            window.huddleNetflixInjected = true;
            
            const bridge = window.HuddleBridge;
            if (!bridge) {
                console.error('HuddleBridge not available');
                return;
            }
            
            bridge.log('Netflix control script initializing...');
            
            let video = null;
            let progressInterval = null;
            let lastReportedTime = -1;
            
            function findVideo() {
                // Netflix uses a video element inside their player
                const videos = document.querySelectorAll('video');
                for (const v of videos) {
                    if (v.src || v.currentSrc) {
                        return v;
                    }
                }
                return videos[0] || null;
            }
            
            function startProgressReporting() {
                if (progressInterval) clearInterval(progressInterval);
                
                progressInterval = setInterval(() => {
                    video = findVideo();
                    if (video) {
                        const currentTime = video.currentTime || 0;
                        const duration = video.duration || 0;
                        const isPlaying = !video.paused && !video.ended;
                        
                        // Only report if time changed significantly (>0.5s)
                        if (Math.abs(currentTime - lastReportedTime) > 0.5 || 
                            (isPlaying !== window.huddleLastIsPlaying)) {
                            lastReportedTime = currentTime;
                            window.huddleLastIsPlaying = isPlaying;
                            bridge.onVideoProgress(currentTime, duration, isPlaying);
                        }
                    }
                }, 500);
            }
            
            function waitForVideo() {
                bridge.log('Waiting for Netflix video element...');
                
                const checkVideo = setInterval(() => {
                    video = findVideo();
                    if (video) {
                        clearInterval(checkVideo);
                        bridge.log('Video element found!');
                        setupVideoListeners();
                        startProgressReporting();
                        bridge.onVideoReady();
                    }
                }, 1000);
                
                // Timeout after 60 seconds
                setTimeout(() => {
                    clearInterval(checkVideo);
                    if (!video) {
                        bridge.onVideoError('Timeout waiting for video element');
                    }
                }, 60000);
            }
            
            function setupVideoListeners() {
                if (!video) return;
                
                video.addEventListener('play', () => {
                    bridge.log('Video play event');
                    bridge.onVideoProgress(video.currentTime, video.duration, true);
                });
                
                video.addEventListener('pause', () => {
                    bridge.log('Video pause event');
                    bridge.onVideoProgress(video.currentTime, video.duration, false);
                });
                
                video.addEventListener('seeked', () => {
                    bridge.log('Video seeked to ' + video.currentTime);
                    bridge.onVideoProgress(video.currentTime, video.duration, !video.paused);
                });
                
                video.addEventListener('ended', () => {
                    bridge.log('Video ended');
                    bridge.onVideoProgress(video.currentTime, video.duration, false);
                });
                
                video.addEventListener('error', (e) => {
                    bridge.onVideoError('Video error: ' + (e.message || 'unknown'));
                });
            }
            
            // Expose control functions to Android
            window.huddleNetflixControl = {
                play: function() {
                    video = findVideo();
                    if (video) {
                        video.play().catch(e => bridge.log('Play error: ' + e.message));
                    }
                },
                pause: function() {
                    video = findVideo();
                    if (video) {
                        video.pause();
                    }
                },
                seek: function(time) {
                    video = findVideo();
                    if (video) {
                        bridge.log('Seeking to ' + time);
                        video.currentTime = time;
                    }
                },
                setVolume: function(vol) {
                    video = findVideo();
                    if (video) {
                        video.volume = Math.max(0, Math.min(1, vol));
                    }
                },
                setMuted: function(muted) {
                    video = findVideo();
                    if (video) {
                        video.muted = muted;
                    }
                },
                setPlaybackRate: function(rate) {
                    video = findVideo();
                    if (video) {
                        video.playbackRate = rate;
                    }
                },
                getState: function() {
                    video = findVideo();
                    if (video) {
                        return {
                            currentTime: video.currentTime,
                            duration: video.duration,
                            isPlaying: !video.paused && !video.ended,
                            volume: video.volume,
                            muted: video.muted,
                            playbackRate: video.playbackRate
                        };
                    }
                    return null;
                }
            };
            
            waitForVideo();
            bridge.log('Netflix control script loaded');
        })();
    """.trimIndent()
    
    // Create JS bridge
    val jsBridge = remember {
        NetflixJsBridge(
            onProgress = { time, duration, playing ->
                netflixCurrentTime = time
                netflixDuration = duration
                netflixIsPlaying = playing
                
                // Report progress upstream, avoiding feedback loops
                if (kotlin.math.abs(time - lastReportedTime) > 1.0) {
                    lastReportedTime = time
                    onProgress(time, duration)
                }
                
                // Detect play/pause changes
                if (playing != isPlaying) {
                    onPlayPause(playing)
                }
            },
            onReady = {
                isVideoReady = true
                onReady()
            },
            onError = { error ->
                loadError = error
                onError(error)
            }
        )
    }
    
    // Handle remote sync - seek when lastRemoteSyncAt changes
    LaunchedEffect(currentTime, lastRemoteSyncAt) {
        if (!isVideoReady) return@LaunchedEffect
        
        val isRemoteSync = lastRemoteSyncAt > 0 && lastRemoteSyncAt != lastKnownRemoteSyncAt
        if (isRemoteSync) {
            lastKnownRemoteSyncAt = lastRemoteSyncAt
            lastReportedTime = -1.0 // Reset feedback detection
            
            val diff = kotlin.math.abs(currentTime - netflixCurrentTime)
            if (diff > 1.0) {
                Log.d(TAG, "Remote sync: seeking to $currentTime (diff: ${diff}s)")
                webView?.evaluateJavascript("window.huddleNetflixControl?.seek($currentTime);", null)
                lastAppliedTime = currentTime
            }
        } else {
            // Non-remote sync - only seek if significant drift
            val diff = kotlin.math.abs(currentTime - netflixCurrentTime)
            val isOwnFeedback = kotlin.math.abs(currentTime - lastReportedTime) < 2.0
            
            if (!isOwnFeedback && diff > 3.0) {
                Log.d(TAG, "Drift correction: seeking to $currentTime (diff: ${diff}s)")
                webView?.evaluateJavascript("window.huddleNetflixControl?.seek($currentTime);", null)
            }
        }
    }
    
    // Handle play/pause
    LaunchedEffect(isPlaying, isVideoReady) {
        if (!isVideoReady) return@LaunchedEffect
        
        if (isPlaying && !netflixIsPlaying) {
            Log.d(TAG, "Sending play command")
            webView?.evaluateJavascript("window.huddleNetflixControl?.play();", null)
        } else if (!isPlaying && netflixIsPlaying) {
            Log.d(TAG, "Sending pause command")
            webView?.evaluateJavascript("window.huddleNetflixControl?.pause();", null)
        }
    }
    
    // Handle volume
    LaunchedEffect(volume, isMuted, isVideoReady) {
        if (!isVideoReady) return@LaunchedEffect
        
        webView?.evaluateJavascript("window.huddleNetflixControl?.setVolume($volume);", null)
        webView?.evaluateJavascript("window.huddleNetflixControl?.setMuted($isMuted);", null)
    }
    
    // Handle playback speed
    LaunchedEffect(playbackSpeed, isVideoReady) {
        if (!isVideoReady) return@LaunchedEffect
        
        webView?.evaluateJavascript("window.huddleNetflixControl?.setPlaybackRate($playbackSpeed);", null)
    }
    
    // Inject control script when page loads
    LaunchedEffect(webView, isLoading) {
        if (webView != null && !isLoading) {
            delay(2000) // Wait for Netflix page to fully load
            webView?.evaluateJavascript(controlScript, null)
        }
    }
    
    Box(modifier = modifier.fillMaxSize()) {
        AndroidView(
            factory = { ctx ->
                WebView(ctx).apply {
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                    
                    // Enable hardware acceleration for DRM content (Netflix)
                    setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null)
                    
                    settings.apply {
                        javaScriptEnabled = true
                        domStorageEnabled = true
                        databaseEnabled = true
                        mediaPlaybackRequiresUserGesture = false
                        allowFileAccess = true
                        allowContentAccess = true
                        loadWithOverviewMode = true
                        useWideViewPort = true
                        builtInZoomControls = false
                        displayZoomControls = false
                        setSupportZoom(false)
                        
                        // Enable mixed content for Netflix
                        mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                        
                        // Use Android Chrome mobile user agent for proper Netflix DRM support
                        // Netflix requires Widevine which works better with mobile UA
                        val androidVersion = android.os.Build.VERSION.RELEASE
                        val chromeVersion = "120.0.6099.230"
                        userAgentString = "Mozilla/5.0 (Linux; Android $androidVersion; ${android.os.Build.MODEL}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/$chromeVersion Mobile Safari/537.36"
                        
                        // Enable caching for better performance
                        cacheMode = WebSettings.LOAD_DEFAULT
                    }
                    
                    // Add JavaScript interface
                    addJavascriptInterface(jsBridge, "HuddleBridge")
                    
                    webViewClient = object : WebViewClient() {
                        override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                            super.onPageStarted(view, url, favicon)
                            isLoading = true
                            loadError = null
                        }
                        
                        override fun onPageFinished(view: WebView?, url: String?) {
                            super.onPageFinished(view, url)
                            isLoading = false
                            Log.d(TAG, "Page loaded: $url")
                            
                            // Inject control script after page loads
                            view?.evaluateJavascript(controlScript, null)
                        }
                        
                        override fun onReceivedError(
                            view: WebView?,
                            request: WebResourceRequest?,
                            error: WebResourceError?
                        ) {
                            super.onReceivedError(view, request, error)
                            if (request?.isForMainFrame == true) {
                                loadError = error?.description?.toString() ?: "Failed to load page"
                                Log.e(TAG, "WebView error: ${error?.description}")
                            }
                        }
                    }
                    
                    webChromeClient = object : WebChromeClient() {
                        override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                            Log.d(TAG, "Console: ${consoleMessage?.message()}")
                            return true
                        }
                        
                        override fun onPermissionRequest(request: PermissionRequest?) {
                            Log.d(TAG, "Permission request: ${request?.resources?.joinToString(", ")}")
                            // Grant all permissions for Netflix DRM and media playback
                            request?.grant(request.resources)
                        }
                    }
                    
                    // Enable cookies for Netflix login
                    CookieManager.getInstance().apply {
                        setAcceptCookie(true)
                    }
                    val cookieManager = CookieManager.getInstance()
                    cookieManager.setAcceptThirdPartyCookies(this, true)
                    
                    webView = this
                    loadUrl(url)
                }
            },
            update = { view ->
                // URL change handling
                if (view.url != url && url.isNotEmpty()) {
                    isVideoReady = false
                    view.loadUrl(url)
                }
            },
            modifier = Modifier.fillMaxSize()
        )
        
        // Loading overlay
        if (isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.7f)),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    CircularProgressIndicator(color = Color.Red)
                    Text(
                        "Loading Netflix...",
                        color = Color.White,
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }
        }
        
        // Error overlay
        loadError?.let { error ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.9f)),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.padding(32.dp)
                ) {
                    Text(
                        "Failed to load Netflix",
                        color = Color.Red,
                        style = MaterialTheme.typography.titleMedium
                    )
                    Text(
                        error,
                        color = Color.White.copy(alpha = 0.7f),
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        }
    }
}

/**
 * Extract Netflix watch ID from URL
 */
fun extractNetflixWatchId(url: String): String? {
    val patterns = listOf(
        Regex("""netflix\.com/watch/(\d+)"""),
        Regex("""netflix\.com/title/(\d+)""")
    )
    
    for (pattern in patterns) {
        val match = pattern.find(url)
        if (match != null) {
            return match.groupValues[1]
        }
    }
    return null
}

/**
 * Build Netflix watch URL from ID
 */
fun buildNetflixWatchUrl(watchId: String): String {
    return "https://www.netflix.com/watch/$watchId"
}
