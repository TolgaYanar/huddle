package tv.wehuddle.app.ui.components

import android.annotation.SuppressLint
import android.app.Activity
import android.app.PictureInPictureParams
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.ActivityInfo
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.util.Log
import android.util.Rational
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.*
import android.graphics.Color as AndroidColor
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.UserAgentMetadata
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature
import kotlinx.coroutines.delay
import java.net.URLDecoder

private const val TAG = "NetflixWebPlayer"

// STRATEGY: Google TV (Android TV Device)
// 1. Passes Android DRM check (E100 fix) - it's an Android-based platform
// 2. Avoids "Download Mobile App" redirect - it's a TV device class, not phone/tablet
// 3. Netflix serves HTML5 player to TV devices automatically
private const val GOOGLE_TV_UA = 
    "Mozilla/5.0 (Linux; GoogleTV 3.0; compiled by Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36"

/**
 * Netflix Web Player - Plays Netflix content directly in a WebView with DRM support
 * Uses JavaScript bridge for play/pause/seek sync control
 * Handles fullscreen video via onShowCustomView/onHideCustomView
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun NetflixWebPlayer(
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
    val activity = remember { context.findActivity() }
    
    var webView by remember { mutableStateOf<WebView?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var isVideoReady by remember { mutableStateOf(false) }
    var localCurrentTime by remember { mutableStateOf(currentTime) }
    var localDuration by remember { mutableStateOf(0.0) }
    var localIsPlaying by remember { mutableStateOf(isPlaying) }
    var showControls by remember { mutableStateOf(true) }
    var lastSeekTime by remember { mutableStateOf(0L) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    
    // State for fullscreen custom video view (Netflix pushes video into this)
    var customView by remember { mutableStateOf<View?>(null) }
    var customViewCallback by remember { mutableStateOf<WebChromeClient.CustomViewCallback?>(null) }
    
    // Handle back press when in fullscreen video mode
    BackHandler(enabled = customView != null) {
        customViewCallback?.onCustomViewHidden()
        customView = null
        customViewCallback = null
        // Restore orientation
        activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }
    
    // JavaScript interface for receiving callbacks from WebView
    val jsInterface = remember {
        NetflixJSInterface(
            onTimeUpdate = { time, duration ->
                localCurrentTime = time
                localDuration = duration
                onProgress(time, duration)
            },
            onPlayStateChange = { playing ->
                localIsPlaying = playing
                if (playing != isPlaying) {
                    onPlayPause(playing)
                }
            },
            onVideoReady = {
                isVideoReady = true
                errorMessage = null
                onReady()
            },
            onVideoError = { error ->
                isLoading = false
                errorMessage = error
                onError(error)
            }
        )
    }
    
    // Build Netflix watch URL - only use /watch/ URLs, not /title/
    val watchUrl = remember(url) {
        val watchId = parseNetflixWatchId(url)
        if (watchId != null) {
            "https://www.netflix.com/watch/$watchId"
        } else {
            url.ifBlank { "https://www.netflix.com/browse" }
        }
    }

    val externalWatchUrl = remember(watchUrl, currentTime) {
        val seconds = currentTime.toInt().coerceAtLeast(0)
        if (seconds <= 0) {
            watchUrl
        } else {
            val separator = if (watchUrl.contains("?")) "&" else "?"
            // Best-effort. Netflix may ignore this, but it doesn't break the URL.
            "$watchUrl${separator}t=$seconds"
        }
    }

    fun openExternal(urlToOpen: String, preferredPackage: String? = null) {
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(urlToOpen)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                preferredPackage?.let { setPackage(it) }
            }
            context.startActivity(intent)
        } catch (e: ActivityNotFoundException) {
            try {
                // Fallback: let Android resolve a handler
                val fallback = Intent(Intent.ACTION_VIEW, Uri.parse(urlToOpen)).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(fallback)
            } catch (e2: Exception) {
                Log.e(TAG, "Failed to open external URL", e2)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open external URL", e)
        }
    }

    fun enterPictureInPictureIfPossible() {
        val host = activity ?: return
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        try {
            val params = PictureInPictureParams.Builder()
                .setAspectRatio(Rational(16, 9))
                .build()
            host.enterPictureInPictureMode(params)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to enter PiP", e)
        }
    }
    
    // Handle remote play/pause commands
    LaunchedEffect(isPlaying, isVideoReady) {
        if (isVideoReady && webView != null) {
            if (isPlaying && !localIsPlaying) {
                webView?.evaluateJavascript("(window.__huddleGetVideo?.() || window.__huddleVideo || document.querySelector('video'))?.play();", null)
            } else if (!isPlaying && localIsPlaying) {
                webView?.evaluateJavascript("(window.__huddleGetVideo?.() || window.__huddleVideo || document.querySelector('video'))?.pause();", null)
            }
        }
    }
    
    // Handle remote seek commands
    LaunchedEffect(currentTime, lastRemoteSyncAt) {
        if (isVideoReady && webView != null && lastRemoteSyncAt > lastSeekTime) {
            val diff = kotlin.math.abs(currentTime - localCurrentTime)
            if (diff > 2.0) {
                Log.d(TAG, "Seeking to $currentTime (diff: $diff)")
                webView?.evaluateJavascript(
                    "var v = (window.__huddleGetVideo?.() || window.__huddleVideo || document.querySelector('video')); if(v) v.currentTime = $currentTime;",
                    null
                )
                lastSeekTime = System.currentTimeMillis()
            }
        }
    }
    
    // Handle mute
    LaunchedEffect(isMuted, isVideoReady) {
        if (isVideoReady && webView != null) {
            webView?.evaluateJavascript(
                "var v = (window.__huddleGetVideo?.() || window.__huddleVideo || document.querySelector('video')); if(v) v.muted = $isMuted;",
                null
            )
        }
    }
    
    // Handle volume
    LaunchedEffect(volume, isVideoReady) {
        if (isVideoReady && webView != null) {
            webView?.evaluateJavascript(
                "var v = (window.__huddleGetVideo?.() || window.__huddleVideo || document.querySelector('video')); if(v) v.volume = $volume;",
                null
            )
        }
    }
    
    // Auto-hide controls
    LaunchedEffect(showControls) {
        if (showControls) {
            delay(5000)
            showControls = false
        }
    }
    
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black)
    ) {
        // Show WebView only when NOT in fullscreen custom view mode
        if (customView == null) {
            // WebView
            AndroidView(
                factory = { ctx ->
                    // CRITICAL: Setup cookies FIRST, before creating WebView
                    val cookieManager = CookieManager.getInstance()
                    cookieManager.setAcceptCookie(true)
                    cookieManager.flush()
                    
                    WebView(ctx).apply {
                        // Enable third-party cookies for this WebView
                        cookieManager.setAcceptThirdPartyCookies(this, true)
                        
                        layoutParams = ViewGroup.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT
                        )
                        setBackgroundColor(AndroidColor.BLACK)
                        
                        // CRITICAL: Clear cache to wipe any sticky E100 DRM licenses
                        // E100 errors are "sticky" - bad licenses get cached and keep failing
                        clearCache(true)
                        
                        // CRITICAL: Enable hardware acceleration for DRM (Widevine)
                        setLayerType(View.LAYER_TYPE_HARDWARE, null)
                        
                        settings.apply {
                            // Google TV UA - Android platform (passes DRM), TV device (no app redirect)
                            userAgentString = GOOGLE_TV_UA
                            
                            javaScriptEnabled = true
                            domStorageEnabled = true  // Required for DRM keys storage
                            databaseEnabled = true
                            mediaPlaybackRequiresUserGesture = false
                            allowContentAccess = true
                            allowFileAccess = true
                            
                            // CRITICAL: Viewport Settings for Desktop Mode
                            loadWithOverviewMode = true
                            useWideViewPort = true
                            builtInZoomControls = true  // Enable zoom for desktop scaling
                            displayZoomControls = false // Hide zoom UI
                            setSupportZoom(true)
                            
                            // CRITICAL: Enable mixed content for DRM handshake
                            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                            
                            // Disable safe browsing - it flags spoofed UA
                            safeBrowsingEnabled = false
                            
                            // Cache settings - preserve DRM session
                            cacheMode = WebSettings.LOAD_DEFAULT
                            
                            setSupportMultipleWindows(false)
                            javaScriptCanOpenWindowsAutomatically = false
                        }

                        // Align User-Agent Client Hints with our overridden UA (prevents "Android WebView" branding leaks)
                        // Netflix DRM logic is very sensitive to UA vs Client Hints mismatches.
                        if (WebViewFeature.isFeatureSupported(WebViewFeature.USER_AGENT_METADATA)) {
                            try {
                                val brands = listOf(
                                    UserAgentMetadata.BrandVersion.Builder()
                                        .setBrand("Not.A/Brand")
                                        .setMajorVersion("99")
                                        .setFullVersion("99.0.0.0")
                                        .build(),
                                    UserAgentMetadata.BrandVersion.Builder()
                                        .setBrand("Chromium")
                                        .setMajorVersion("118")
                                        .setFullVersion("118.0.0.0")
                                        .build(),
                                    UserAgentMetadata.BrandVersion.Builder()
                                        .setBrand("Google Chrome")
                                        .setMajorVersion("118")
                                        .setFullVersion("118.0.0.0")
                                        .build()
                                )

                                val metadata = UserAgentMetadata.Builder()
                                    .setBrandVersionList(brands)
                                    .setFullVersion("118.0.0.0")
                                    .setPlatform("Android")
                                    .setPlatformVersion(Build.VERSION.RELEASE ?: "")
                                    .setModel("Google TV")
                                    .setMobile(false)
                                    .build()

                                WebSettingsCompat.setUserAgentMetadata(settings, metadata)
                                Log.d(TAG, "Applied WebView UA metadata")
                            } catch (e: Exception) {
                                Log.w(TAG, "Failed to apply UA metadata", e)
                            }
                        } else {
                            Log.d(TAG, "WebViewFeature.USER_AGENT_METADATA not supported")
                        }
                        
                        // Add JavaScript interface
                        addJavascriptInterface(jsInterface, "HuddleSync")
                        
                        webViewClient = NetflixWebViewClient(
                            onPageStarted = { isLoading = true },
                            onPageFinished = {
                                isLoading = false
                                injectSyncScript(this)
                            },
                            onError = { error -> onError(error) }
                        )
                        
                        // CRITICAL: WebChromeClient with DRM permissions AND custom view handling
                        webChromeClient = object : WebChromeClient() {
                            // Grant ALL permissions Netflix asks for (DRM, Audio, Video, MIDI)
                            override fun onPermissionRequest(request: PermissionRequest?) {
                                request?.let { req ->
                                    Log.d(TAG, "Granting DRM permissions: ${req.resources.joinToString()}")
                                    req.grant(req.resources)
                                }
                            }
                            
                            // CRITICAL: Handle fullscreen video view
                            // Netflix HTML5 player moves <video> into a custom view for playback
                            // If we don't handle this, video won't render (black screen or sound only)
                            override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
                                Log.d(TAG, "Entering fullscreen video mode")
                                customView = view
                                customViewCallback = callback
                                
                                // Force landscape and keep screen on
                                activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                                activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                            }
                            
                            override fun onHideCustomView() {
                                Log.d(TAG, "Exiting fullscreen video mode")
                                customView = null
                                customViewCallback?.onCustomViewHidden()
                                customViewCallback = null
                                
                                // Restore orientation
                                activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                                activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                            }
                            
                            override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                                consoleMessage?.let {
                                    Log.d(TAG, "Console: ${it.message()}")
                                }
                                return true
                            }
                        }
                        
                        // Load Netflix
                        loadUrl(watchUrl)
                        webView = this
                    }
                },
                modifier = Modifier.fillMaxSize(),
                update = { view ->
                    webView = view
                }
            )
        }
        
        // CRITICAL: Custom Video View overlay
        // When Netflix triggers fullscreen, we show this view instead of WebView
        customView?.let { view ->
            AndroidView(
                factory = { _ ->
                    view.apply {
                        layoutParams = ViewGroup.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT
                        )
                        setBackgroundColor(AndroidColor.BLACK)
                    }
                },
                modifier = Modifier.fillMaxSize()
            )
        }
        
        // Loading overlay (only show when not in fullscreen)
        if (isLoading && customView == null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.8f)),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    CircularProgressIndicator(
                        color = Color(0xFFE50914),
                        strokeWidth = 3.dp
                    )
                    Text(
                        "Loading Netflix...",
                        color = Color.White,
                        fontSize = 14.sp
                    )
                }
            }
        }

        // Error overlay (only when not in fullscreen)
        if (customView == null && errorMessage != null) {
            val msg = errorMessage ?: ""
            val isE100 = msg.contains("E100", ignoreCase = true)

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.85f)),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text(
                        text = if (isE100) "Netflix playback blocked (E100)" else "Netflix playback error",
                        color = Color.White,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold
                    )

                    Text(
                        text = if (isE100) {
                            "Netflix is rejecting embedded WebView playback on this device. Open the title in the Netflix app or a browser to watch."
                        } else {
                            msg
                        },
                        color = Color.White.copy(alpha = 0.8f),
                        fontSize = 13.sp
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Button(
                            onClick = {
                                enterPictureInPictureIfPossible()
                                openExternal(watchUrl, preferredPackage = "com.netflix.mediaclient")
                            },
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("Open Netflix App")
                        }

                        OutlinedButton(
                            onClick = { openExternal(externalWatchUrl) },
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("Open in Browser")
                        }
                    }
                }
            }
        }
        
        // Sync controls overlay (only when not in fullscreen)
        if (customView == null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp),
                contentAlignment = Alignment.TopEnd
            ) {
                // Sync indicator badge
                if (isVideoReady) {
                    Surface(
                        color = Color.Black.copy(alpha = 0.7f),
                        shape = RoundedCornerShape(20.dp),
                        modifier = Modifier.padding(8.dp)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(8.dp)
                                    .clip(CircleShape)
                                    .background(if (localIsPlaying) Color(0xFF22C55E) else Color(0xFFF59E0B))
                            )
                            Text(
                                text = if (localIsPlaying) "Synced" else "Paused",
                                color = Color.White,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Medium
                            )
                            Text(
                                text = formatTime(localCurrentTime),
                                color = Color.White.copy(alpha = 0.7f),
                                fontSize = 12.sp
                            )
                        }
                    }
                }
            }
            
            // Bottom controls (only when not in fullscreen)
            if (isVideoReady && showControls) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.BottomCenter)
                        .background(
                            brush = androidx.compose.ui.graphics.Brush.verticalGradient(
                                colors = listOf(Color.Transparent, Color.Black.copy(alpha = 0.8f))
                            )
                        )
                        .padding(16.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceEvenly,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Rewind 10s
                        IconButton(
                            onClick = {
                                val newTime = (localCurrentTime - 10).coerceAtLeast(0.0)
                                webView?.evaluateJavascript(
                                    "var v = (window.__huddleGetVideo?.() || window.__huddleVideo || document.querySelector('video')); if(v) v.currentTime = $newTime;",
                                    null
                                )
                            }
                        ) {
                            Icon(
                                Icons.Default.Replay10,
                                contentDescription = "Rewind 10s",
                                tint = Color.White,
                                modifier = Modifier.size(32.dp)
                            )
                        }
                        
                        // Play/Pause
                        IconButton(
                            onClick = { onPlayPause(!localIsPlaying) }
                        ) {
                            Icon(
                                if (localIsPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                                contentDescription = if (localIsPlaying) "Pause" else "Play",
                                tint = Color.White,
                                modifier = Modifier.size(48.dp)
                            )
                        }
                        
                        // Forward 10s
                        IconButton(
                            onClick = {
                                val newTime = localCurrentTime + 10
                                webView?.evaluateJavascript(
                                    "var v = (window.__huddleGetVideo?.() || window.__huddleVideo || document.querySelector('video')); if(v) v.currentTime = $newTime;",
                                    null
                                )
                            }
                        ) {
                            Icon(
                                Icons.Default.Forward10,
                                contentDescription = "Forward 10s",
                                tint = Color.White,
                                modifier = Modifier.size(32.dp)
                            )
                        }
                    }
                }
            }
        }
    }
    
    // Cleanup - DON'T clear history/cache to preserve DRM session
    DisposableEffect(Unit) {
        onDispose {
            webView?.apply {
                stopLoading()
                CookieManager.getInstance().flush()
                removeAllViews()
                destroy()
            }
        }
    }
}

/**
 * JavaScript interface for receiving callbacks from Netflix player
 */
private class NetflixJSInterface(
    private val onTimeUpdate: (time: Double, duration: Double) -> Unit,
    private val onPlayStateChange: (playing: Boolean) -> Unit,
    private val onVideoReady: () -> Unit,
    private val onVideoError: (String) -> Unit
) {
    @JavascriptInterface
    fun onTimeReceived(time: Double, duration: Double) {
        Log.d(TAG, "Time update: $time / $duration")
        onTimeUpdate(time, duration)
    }
    
    @JavascriptInterface
    fun onPlayStateChanged(playing: Boolean) {
        Log.d(TAG, "Play state: $playing")
        onPlayStateChange(playing)
    }
    
    @JavascriptInterface
    fun onReady() {
        Log.d(TAG, "Video ready")
        onVideoReady()
    }
    
    @JavascriptInterface
    fun onError(message: String) {
        Log.e(TAG, "Video error: $message")
        onVideoError(message)
    }
}

/**
 * WebViewClient for handling Netflix page loading
 * CRITICAL: Block /title/ URLs - they trigger app redirects
 */
private class NetflixWebViewClient(
    private val onPageStarted: () -> Unit,
    private val onPageFinished: () -> Unit,
    private val onError: (String) -> Unit
) : WebViewClient() {
    
    // TV Identity Spoof - TVs don't have touch and use 1080p
    private val tvSpoof = """
        (function() {
            try {
                // TV MODE: No Touch Input
                Object.defineProperty(navigator, 'maxTouchPoints', {
                    get: () => 0,
                    configurable: true
                });
                Object.defineProperty(navigator, 'msMaxTouchPoints', {
                    get: () => 0,
                    configurable: true
                });
                Object.defineProperty(navigator, 'ontouchstart', {
                    get: () => undefined,
                    configurable: true
                });
                
                // FORCE 1080p TV RESOLUTION
                const w = 1920, h = 1080;
                Object.defineProperty(window, 'innerWidth', {get: () => w, configurable: true});
                Object.defineProperty(window, 'innerHeight', {get: () => h, configurable: true});
                Object.defineProperty(screen, 'width', {get: () => w, configurable: true});
                Object.defineProperty(screen, 'height', {get: () => h, configurable: true});
                Object.defineProperty(screen, 'availWidth', {get: () => w, configurable: true});
                Object.defineProperty(screen, 'availHeight', {get: () => h, configurable: true});
                
                console.log('Huddle: Google TV Identity Applied (No Touch, 1080p)');
            } catch(e) { 
                console.error('Huddle TV Spoof Error:', e); 
            }
        })();
    """.trimIndent()
    
    // CSS Patch: Hide app banners and force video visible
    private val cssPatch = """
        (function() {
            if (!document || !document.head) {
                console.log('Huddle: CSS Patch Skipped (no document.head yet)');
                return;
            }

            var style = document.createElement('style');
            style.id = 'huddle-fix';
            style.innerHTML = `
                /* Hide 'Get the App' Banners and Overlays */
                .e1x52tce0, .banner-container, .default-ltr-cache-1d3w5wd, 
                .mobile-app-banner, .app-banner, [data-uia*="banner"],
                [data-uia="interrupt-autoplay-app"], .interrupter-container,
                header, .watch-video--back-container, .pinning-header-container { 
                    display: none !important; 
                    visibility: hidden !important;
                }
                
                /* Force Video Player to Top and Visible */
                video { 
                    z-index: 99999 !important; 
                    visibility: visible !important;
                    display: block !important;
                    position: fixed !important; 
                    top: 0 !important; 
                    left: 0 !important;
                    width: 100vw !important; 
                    height: 100vh !important;
                    object-fit: contain !important;
                    background: black !important;
                }
                
                /* Black Background */
                body, html { 
                    background: black !important; 
                    overflow: hidden !important;
                    margin: 0 !important;
                    padding: 0 !important;
                }
            `;
            
            var existing = document.getElementById('huddle-fix');
            if (existing) existing.remove();
            document.head.appendChild(style);
            
            console.log('Huddle: CSS Patch Applied');
        })();
    """.trimIndent()
    
    override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
        super.onPageStarted(view, url, favicon)
        Log.d(TAG, "Page started: $url")
        
        // INJECT TV SPOOF EARLY - no touch, 1080p resolution
        view?.evaluateJavascript(tvSpoof, null)
        
        onPageStarted()
    }
    
    override fun onPageFinished(view: WebView?, url: String?) {
        super.onPageFinished(view, url)
        Log.d(TAG, "Page finished: $url")
        CookieManager.getInstance().flush()
        
        // 1. Re-inject TV spoof (in case Netflix overwrote it)
        view?.evaluateJavascript(tvSpoof, null)
        
        // 2. DEBUG: Log page status
        view?.evaluateJavascript("""
            console.log('HUDDLE DEBUG: Title=[' + document.title + '] URL=[' + window.location.href + ']');
            console.log('HUDDLE DEBUG: UA=[' + navigator.userAgent.substring(0, 50) + '...]');
            console.log('HUDDLE DEBUG: Touch=' + navigator.maxTouchPoints + ' Width=' + window.innerWidth);
            try {
                var uad = navigator.userAgentData;
                console.log('HUDDLE DEBUG: UAData=' + (uad ? ('mobile=' + uad.mobile + ' platform=' + uad.platform + ' brands=' + JSON.stringify(uad.brands)) : 'none'));
            } catch (e) {
                console.log('HUDDLE DEBUG: UAData=error');
            }
        """.trimIndent(), null)
        
        // 3. Apply CSS patch
        view?.evaluateJavascript(cssPatch, null)
        
        // 4. MutationObserver to continuously remove app banners
        view?.evaluateJavascript("""
            (function() {
                function removeBanners() {
                    var selectors = [
                        '.e1x52tce0', '.banner-container', '.mobile-app-banner',
                        '[data-uia*="banner"]', '[data-uia*="app"]', 'header'
                    ];
                    selectors.forEach(function(sel) {
                        document.querySelectorAll(sel).forEach(function(el) { el.remove(); });
                    });
                }
                
                removeBanners();
                
                if (document.body) {
                    var observer = new MutationObserver(removeBanners);
                    observer.observe(document.body, { childList: true, subtree: true });
                }
            })();
        """.trimIndent(), null)
        
        onPageFinished()
    }
    
    override fun onReceivedError(
        view: WebView?,
        request: WebResourceRequest?,
        error: WebResourceError?
    ) {
        super.onReceivedError(view, request, error)
        if (request?.isForMainFrame == true) {
            onError("Failed to load Netflix: ${error?.description}")
        }
    }
    
    override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
        val url = request?.url?.toString() ?: return false
        
        // CRITICAL: Safe Intent Rescue - Use view.post() to prevent chrome-error crash
        // Even with Google TV UA, Netflix sometimes tries intent:// as fallback
        if (url.startsWith("intent://")) {
            Log.d(TAG, "Intercepted intent redirect: $url")
            
            try {
                // Parse browser_fallback_url from intent string
                val fallbackPart = url.substringAfter("S.browser_fallback_url=", "")
                if (fallbackPart.isNotEmpty()) {
                    val encodedUrl = fallbackPart.substringBefore(";end").substringBefore(';')
                    
                    val decodedUrl = URLDecoder.decode(encodedUrl, "UTF-8")
                    Log.d(TAG, "Rescuing with fallback URL: $decodedUrl")
                    
                    // CRITICAL FIX: Use view.post() to avoid navigation conflict
                    // Calling loadUrl() synchronously during shouldOverrideUrlLoading causes chrome-error
                    // post() allows current navigation to finish cancelling first
                    view?.post {
                        view.loadUrl(decodedUrl)
                    }
                    return true
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to parse intent fallback URL", e)
            }
            
            return true // Block intent if no fallback found
        }
        
        // Block native Netflix app deep links
        if (url.startsWith("nflx:") || url.contains("play.google.com")) {
            Log.d(TAG, "Blocked app deep link: $url")
            return true
        }
        
        // Allow normal HTTP/HTTPS navigation
        return false
    }
}

/**
 * Inject JavaScript to sync video state with Kotlin
 */
private fun injectSyncScript(webView: WebView) {
    val script = """
        (function() {
            console.log('Huddle sync script injecting...');

            function textContainsE100() {
                try {
                    if (!document || !document.body) return false;
                    var t = document.body.innerText;
                    return !!(t && t.indexOf('E100') !== -1);
                } catch (e) {
                    return false;
                }
            }

            function findVideoInShadowRoots(root) {
                try {
                    if (!root) return null;
                    // direct
                    if (root.querySelector) {
                        var direct = root.querySelector('video');
                        if (direct) return direct;
                    }

                    // walk and inspect shadow roots
                    var treeWalker = document.createTreeWalker(
                        root,
                        NodeFilter.SHOW_ELEMENT,
                        null,
                        false
                    );
                    var node = treeWalker.currentNode;
                    while (node) {
                        try {
                            if (node.shadowRoot) {
                                var v = findVideoInShadowRoots(node.shadowRoot);
                                if (v) return v;
                            }
                        } catch (e) {}
                        node = treeWalker.nextNode();
                    }
                } catch (e) {}
                return null;
            }

            function findAnyVideo() {
                // main document
                var v = null;
                try { v = document.querySelector('video'); } catch (e) {}
                if (v) return v;
                v = findVideoInShadowRoots(document);
                if (v) return v;

                // accessible iframes (same-origin only)
                try {
                    var frames = document.querySelectorAll('iframe');
                    for (var i = 0; i < frames.length; i++) {
                        var f = frames[i];
                        try {
                            var doc = f.contentDocument;
                            if (!doc) continue;
                            var fv = doc.querySelector('video') || findVideoInShadowRoots(doc);
                            if (fv) return fv;
                        } catch (e) {
                            // cross-origin frame; ignore
                        }
                    }
                } catch (e) {}
                return null;
            }

            // Expose a stable getter so Kotlin can target the right element even if Netflix re-parents it
            window.__huddleGetVideo = function() {
                try {
                    return window.__huddleVideo || findAnyVideo();
                } catch (e) {
                    return null;
                }
            };
            
            function waitForVideo() {
                var video = window.__huddleGetVideo();
                if (video) {
                    console.log('Video element found!');
                    window.__huddleVideo = video;
                    setupSync(video);
                } else {
                    // periodic diagnostics
                    try {
                        if (!window.__huddleWaitCount) window.__huddleWaitCount = 0;
                        window.__huddleWaitCount++;
                        if (window.__huddleWaitCount % 6 === 0) {
                            var title = (document && document.title) ? document.title : '';
                            var href = (window && window.location) ? window.location.href : '';
                            var iframeCount = 0;
                            try { iframeCount = document.querySelectorAll('iframe').length; } catch (e) {}
                            console.log('HUDDLE DEBUG: wait=' + window.__huddleWaitCount + ' title=[' + title + '] url=[' + href + '] iframes=' + iframeCount + ' e100=' + (textContainsE100() ? '1' : '0'));
                        }
                        if (textContainsE100()) {
                            HuddleSync.onError('Netflix E100 playback error');
                            return;
                        }
                    } catch (e) {}

                    console.log('Waiting for video element...');
                    setTimeout(waitForVideo, 500);
                }
            }
            
            function setupSync(video) {
                HuddleSync.onReady();
                
                var lastUpdate = 0;
                video.addEventListener('timeupdate', function() {
                    var now = Date.now();
                    if (now - lastUpdate > 1000) {
                        lastUpdate = now;
                        HuddleSync.onTimeReceived(video.currentTime, video.duration || 0);
                    }
                });
                
                video.addEventListener('play', function() {
                    HuddleSync.onPlayStateChanged(true);
                });
                
                video.addEventListener('pause', function() {
                    HuddleSync.onPlayStateChanged(false);
                });
                
                video.addEventListener('playing', function() {
                    HuddleSync.onPlayStateChanged(true);
                });
                
                video.addEventListener('error', function(e) {
                    HuddleSync.onError('Video error: ' + (e.message || 'Unknown error'));
                });
                
                video.addEventListener('seeked', function() {
                    HuddleSync.onTimeReceived(video.currentTime, video.duration || 0);
                });
                
                console.log('Huddle sync setup complete!');
            }
            
            waitForVideo();
        })();
    """.trimIndent()
    
    webView.evaluateJavascript(script, null)
}

/**
 * Extract Netflix watch ID from URL (handles both /watch/ and /title/)
 */
private fun parseNetflixWatchId(url: String): String? {
    if (url.isBlank()) return null
    val watchRegex = Regex("""netflix\.com/watch/(\d+)""")
    watchRegex.find(url)?.groupValues?.get(1)?.let { return it }
    val titleRegex = Regex("""netflix\.com/title/(\d+)""")
    titleRegex.find(url)?.groupValues?.get(1)?.let { return it }
    return null
}

/**
 * Format seconds to MM:SS or HH:MM:SS
 */
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

/**
 * Helper to find Activity from Context
 */
private fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
