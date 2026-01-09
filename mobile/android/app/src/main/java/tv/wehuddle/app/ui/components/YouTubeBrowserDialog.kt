package tv.wehuddle.app.ui.components

import android.annotation.SuppressLint
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import tv.wehuddle.app.data.model.canonicalizeKickUrl
import tv.wehuddle.app.data.model.canonicalizeTwitchUrl
import tv.wehuddle.app.data.model.extractYoutubeVideoId
import tv.wehuddle.app.ui.theme.Black50
import tv.wehuddle.app.ui.theme.Indigo500
import tv.wehuddle.app.ui.theme.Slate200
import tv.wehuddle.app.ui.theme.Slate50
import tv.wehuddle.app.ui.theme.Slate500
import tv.wehuddle.app.ui.theme.Slate600
import tv.wehuddle.app.ui.theme.Slate700
import tv.wehuddle.app.ui.theme.Slate800
import tv.wehuddle.app.ui.theme.Slate900
import java.net.URLEncoder

enum class InAppVideoSource(
    val displayName: String,
    val homeUrl: String
) {
    YOUTUBE("YouTube", "https://m.youtube.com"),
    TWITCH("Twitch", "https://m.twitch.tv"),
    KICK("Kick", "https://kick.com"),
    NETFLIX("Netflix", "https://www.netflix.com")
}

@Composable
fun YouTubeBrowserDialog(
    initialQuery: String = "",
    onDismiss: () -> Unit,
    onSelectUrl: (String) -> Unit
) {
    InAppVideoBrowserDialog(
        source = InAppVideoSource.YOUTUBE,
        initialQuery = initialQuery,
        onDismiss = onDismiss,
        onSelectUrl = onSelectUrl
    )
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun InAppVideoBrowserDialog(
    source: InAppVideoSource,
    initialQuery: String = "",
    onDismiss: () -> Unit,
    onSelectUrl: (String) -> Unit
) {
    val context = LocalContext.current

    var query by remember { mutableStateOf(initialQuery) }
    var isLoading by remember { mutableStateOf(true) }
    var currentUrl by remember { mutableStateOf<String?>(null) }

    fun buildSearchUrl(q: String): String {
        val encoded = URLEncoder.encode(q, Charsets.UTF_8.name())
        return when (source) {
            InAppVideoSource.YOUTUBE -> "https://m.youtube.com/results?search_query=$encoded"
            InAppVideoSource.TWITCH -> "https://m.twitch.tv/search?term=$encoded"
            InAppVideoSource.KICK -> "https://kick.com/search?query=$encoded"
            InAppVideoSource.NETFLIX -> "https://www.netflix.com/search?q=$encoded"
        }
    }

    var startUrl by remember {
        mutableStateOf(
            initialQuery.trim().takeIf { it.isNotBlank() }?.let { buildSearchUrl(it) }
                ?: source.homeUrl
        )
    }

    fun trySelect(url: String): Boolean {
        return when (source) {
            InAppVideoSource.YOUTUBE -> {
                val id = extractYoutubeVideoId(url)
                if (id != null) {
                    onSelectUrl("https://www.youtube.com/watch?v=$id")
                    true
                } else {
                    false
                }
            }
            InAppVideoSource.TWITCH -> {
                val canonical = canonicalizeTwitchUrl(url)
                if (canonical != null) {
                    onSelectUrl(canonical)
                    true
                } else {
                    false
                }
            }
            InAppVideoSource.KICK -> {
                val canonical = canonicalizeKickUrl(url)
                if (canonical != null) {
                    onSelectUrl(canonical)
                    true
                } else {
                    false
                }
            }
            InAppVideoSource.NETFLIX -> {
                // Netflix URLs can be /watch/12345678 or /title/12345678
                if (url.contains("netflix.com")) {
                    // Try to extract watch ID
                    val watchId = Regex("/watch/(\\d+)").find(url)?.groupValues?.get(1)
                    if (watchId != null) {
                        onSelectUrl("https://www.netflix.com/watch/$watchId")
                        true
                    } else {
                        // Try to extract title ID (browsing page)
                        val titleId = Regex("/title/(\\d+)").find(url)?.groupValues?.get(1)
                        if (titleId != null) {
                            onSelectUrl("https://www.netflix.com/watch/$titleId")
                            true
                        } else {
                            false
                        }
                    }
                } else {
                    false
                }
            }
        }
    }

    val webView = remember {
        WebView(context).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )

            CookieManager.getInstance().setAcceptCookie(true)
            try {
                CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
            } catch (_: Exception) {
            }

            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                loadWithOverviewMode = true
                useWideViewPort = true
                cacheMode = WebSettings.LOAD_DEFAULT
                mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                mediaPlaybackRequiresUserGesture = true
                allowFileAccess = false
                allowContentAccess = false
                setSupportZoom(true)
                builtInZoomControls = true
                displayZoomControls = false
                // Netflix requires desktop user agent to avoid redirect to app
                userAgentString = if (source == InAppVideoSource.NETFLIX) {
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                } else {
                    userAgentString + " HuddleInAppBrowser"
                }
            }

            webChromeClient = object : WebChromeClient() {
                override fun onProgressChanged(view: WebView?, newProgress: Int) {
                    super.onProgressChanged(view, newProgress)
                    currentUrl = view?.url
                }
            }

            webViewClient = object : WebViewClient() {
                override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                    super.onPageStarted(view, url, favicon)
                    isLoading = true
                    currentUrl = url
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    isLoading = false
                    currentUrl = url
                }

                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                    val target = request?.url?.toString() ?: return false
                    val scheme = request?.url?.scheme

                    // Keep browsing strictly in-app; block any attempt to bounce to other apps.
                    if (
                        target.startsWith("intent:", ignoreCase = true) ||
                        target.startsWith("market:", ignoreCase = true) ||
                        target.startsWith("mailto:", ignoreCase = true) ||
                        target.startsWith("tel:", ignoreCase = true) ||
                        target.startsWith("vnd.youtube:", ignoreCase = true) ||
                        target.startsWith("twitch:", ignoreCase = true) ||
                        target.startsWith("kick:", ignoreCase = true) ||
                        target.startsWith("nflx:", ignoreCase = true) ||
                        (scheme != null && scheme !in setOf("http", "https", "about", "javascript"))
                    ) {
                        return true
                    }

                    if (trySelect(target)) {
                        return true
                    }

                    return false
                }
            }
        }
    }

    BackHandler(enabled = true) {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            onDismiss()
        }
    }

    DisposableEffect(webView) {
        onDispose {
            try {
                webView.stopLoading()
                webView.destroy()
            } catch (_: Exception) {
            }
        }
    }

    LaunchedEffect(startUrl) {
        isLoading = true
        webView.loadUrl(startUrl)
    }

    androidx.compose.ui.window.Dialog(onDismissRequest = onDismiss) {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(0.9f)
                .clip(RoundedCornerShape(16.dp)),
            color = Slate900,
            tonalElevation = 2.dp
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Slate800)
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            text = "${source.displayName} (in-app)",
                            style = TextStyle(
                                color = Slate50,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        )

                        IconButton(
                            onClick = { if (webView.canGoBack()) webView.goBack() },
                            enabled = webView.canGoBack()
                        ) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = "Back",
                                tint = if (webView.canGoBack()) Slate200 else Slate600
                            )
                        }

                        IconButton(
                            onClick = { if (webView.canGoForward()) webView.goForward() },
                            enabled = webView.canGoForward()
                        ) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                                contentDescription = "Forward",
                                tint = if (webView.canGoForward()) Slate200 else Slate600
                            )
                        }
                    }

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        val canSelect = currentUrl?.let {
                            when (source) {
                                InAppVideoSource.YOUTUBE -> extractYoutubeVideoId(it) != null
                                InAppVideoSource.TWITCH -> canonicalizeTwitchUrl(it) != null
                                InAppVideoSource.KICK -> canonicalizeKickUrl(it) != null
                                InAppVideoSource.NETFLIX -> it.contains("netflix.com") && (it.contains("/watch/") || it.contains("/title/"))
                            }
                        } == true

                        Button(
                            onClick = {
                                val url = currentUrl
                                if (url != null) {
                                    trySelect(url)
                                }
                            },
                            enabled = canSelect,
                            colors = ButtonDefaults.buttonColors(containerColor = Indigo500)
                        ) {
                            Text("Select")
                        }

                        IconButton(onClick = onDismiss) {
                            Icon(
                                imageVector = Icons.Default.Close,
                                contentDescription = "Close",
                                tint = Slate200
                            )
                        }
                    }
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedTextField(
                        value = query,
                        onValueChange = { query = it },
                        placeholder = { Text("Search ${source.displayName}…", color = Slate500, fontSize = 14.sp) },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        colors = TextFieldDefaults.colors(
                            focusedContainerColor = Slate900,
                            unfocusedContainerColor = Slate900,
                            focusedIndicatorColor = Indigo500,
                            unfocusedIndicatorColor = Slate700,
                            focusedTextColor = Slate50,
                            unfocusedTextColor = Slate50,
                            cursorColor = Indigo500
                        ),
                        textStyle = TextStyle(fontSize = 14.sp)
                    )

                    Button(
                        onClick = {
                            val q = query.trim()
                            startUrl = if (q.isNotEmpty()) buildSearchUrl(q) else source.homeUrl
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Indigo500)
                    ) {
                        Icon(Icons.Default.Search, contentDescription = null)
                    }
                }

                Box(modifier = Modifier.fillMaxSize()) {
                    AndroidView(
                        factory = { webView },
                        modifier = Modifier.fillMaxSize()
                    )

                    if (isLoading) {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .background(Black50),
                            contentAlignment = Alignment.Center
                        ) {
                            CircularProgressIndicator(color = Slate200)
                        }
                    }
                }
            }
        }
    }
}
