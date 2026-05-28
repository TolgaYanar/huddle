package tv.wehuddle.app.data.model

/**
 * Supported video platform types
 */
enum class PlatformType {
    // Tier 1 — full programmatic control via ExoPlayer or YouTube WebView.
    YOUTUBE,
    DIRECT,
    HLS,
    DASH,

    // Tier 1.5 — rendered as an iframe in the WebView path; full sync needs
    // platform-specific JS-bridge work that isn't done yet on Android.
    VIMEO,
    DAILYMOTION,
    WISTIA,
    SOUNDCLOUD,
    PEERTUBE,

    // Tier 2 — embed only, no remote sync.
    TWITCH,
    KICK,
    SPOTIFY,
    TIKTOK,
    LOOM,

    // Tier 3 — DRM, can't embed inline. Player swaps to a CTA card.
    PRIME,
    NETFLIX,
    DISNEY_PLUS,
    HBO,
    HULU,
    APPLE_TV_PLUS,
    PARAMOUNT_PLUS,
    PEACOCK,

    UNKNOWN
}

/**
 * Capabilities of each platform
 */
data class PlatformCapabilities(
    val canPlay: Boolean,
    val canPause: Boolean,
    val canSeek: Boolean,
    val canMute: Boolean,
    val canChangeSpeed: Boolean,
    val canChangeVolume: Boolean,
    val canGetDuration: Boolean,
    val canGetCurrentTime: Boolean,
    val speedOptions: List<Float>
)

/**
 * Platform capabilities registry
 */
object PlatformCapabilitiesRegistry {
    private val FULL = PlatformCapabilities(
        canPlay = true,
        canPause = true,
        canSeek = true,
        canMute = true,
        canChangeSpeed = true,
        canChangeVolume = true,
        canGetDuration = true,
        canGetCurrentTime = true,
        speedOptions = listOf(0.25f, 0.5f, 0.75f, 1f, 1.25f, 1.5f, 1.75f, 2f),
    )
    private val FULL_WIDE = FULL.copy(
        speedOptions = listOf(0.25f, 0.5f, 0.75f, 1f, 1.25f, 1.5f, 1.75f, 2f, 2.5f, 3f),
    )
    private val NONE = PlatformCapabilities(
        canPlay = false,
        canPause = false,
        canSeek = false,
        canMute = false,
        canChangeSpeed = false,
        canChangeVolume = false,
        canGetDuration = false,
        canGetCurrentTime = false,
        speedOptions = emptyList(),
    )

    private val capabilities = mapOf(
        PlatformType.YOUTUBE to FULL,
        PlatformType.DIRECT to FULL_WIDE,
        PlatformType.HLS to FULL_WIDE,
        PlatformType.DASH to FULL_WIDE,
        // Tier 2 — embed-only: we render the iframe but don't drive it.
        PlatformType.TWITCH to NONE,
        PlatformType.KICK to NONE,
        PlatformType.SPOTIFY to NONE,
        PlatformType.TIKTOK to NONE,
        PlatformType.LOOM to NONE,

        // Tier 1.5 — rendered as iframes; full sync needs per-platform JS
        // bridge work which the web app already has but Android doesn't yet.
        PlatformType.VIMEO to NONE,
        PlatformType.DAILYMOTION to NONE,
        PlatformType.WISTIA to NONE,
        PlatformType.SOUNDCLOUD to NONE,
        PlatformType.PEERTUBE to NONE,

        // Tier 3 — DRM, no inline embed.
        PlatformType.PRIME to NONE,
        PlatformType.NETFLIX to PlatformCapabilities(
            canPlay = true,
            canPause = true,
            canSeek = true,
            canMute = true,
            canChangeSpeed = true,
            canChangeVolume = true,
            canGetDuration = true,
            canGetCurrentTime = true,
            speedOptions = listOf(0.5f, 0.75f, 1f, 1.25f, 1.5f),
        ),
        PlatformType.DISNEY_PLUS to NONE,
        PlatformType.HBO to NONE,
        PlatformType.HULU to NONE,
        PlatformType.APPLE_TV_PLUS to NONE,
        PlatformType.PARAMOUNT_PLUS to NONE,
        PlatformType.PEACOCK to NONE,

        PlatformType.UNKNOWN to PlatformCapabilities(
            canPlay = true,
            canPause = true,
            canSeek = true,
            canMute = true,
            canChangeSpeed = true,
            canChangeVolume = true,
            canGetDuration = true,
            canGetCurrentTime = true,
            speedOptions = listOf(0.5f, 0.75f, 1f, 1.25f, 1.5f, 2f),
        ),
    )

    fun getCapabilities(platform: PlatformType): PlatformCapabilities {
        return capabilities[platform] ?: capabilities[PlatformType.UNKNOWN]!!
    }
}

/**
 * Detect platform from URL
 */
fun detectPlatform(url: String): PlatformType {
    if (url.isBlank()) return PlatformType.UNKNOWN
    
    val trimmedUrl = url.trim()
    if (trimmedUrl.isEmpty()) return PlatformType.UNKNOWN
    
    val lower = trimmedUrl.lowercase()
    return when {
        // Tier 3 — DRM. Checked before any direct-file regex so a content URL
        // hosted on e.g. netflix.com still routes to the CTA, not ExoPlayer.
        lower.contains("netflix.com") -> PlatformType.NETFLIX
        lower.contains("primevideo") || lower.contains("amazon.com/gp/video") -> PlatformType.PRIME
        lower.contains("disneyplus.com") -> PlatformType.DISNEY_PLUS
        lower.contains("hbomax.com") || lower.contains("max.com") || lower.contains("play.hbomax.com") -> PlatformType.HBO
        lower.contains("hulu.com") -> PlatformType.HULU
        lower.contains("tv.apple.com") -> PlatformType.APPLE_TV_PLUS
        lower.contains("paramountplus.com") -> PlatformType.PARAMOUNT_PLUS
        lower.contains("peacocktv.com") -> PlatformType.PEACOCK

        // Tier 1 / 1.5 / 2 — embed-friendly platforms.
        lower.contains("youtube.com") || lower.contains("youtu.be") -> PlatformType.YOUTUBE
        lower.contains("vimeo.com") || lower.contains("player.vimeo.com") -> PlatformType.VIMEO
        lower.contains("dailymotion.com") || lower.contains("dai.ly") -> PlatformType.DAILYMOTION
        lower.contains("wistia.com") || lower.contains("wi.st") -> PlatformType.WISTIA
        lower.contains("soundcloud.com") -> PlatformType.SOUNDCLOUD
        lower.contains("open.spotify.com") || lower.contains("spotify.com") -> PlatformType.SPOTIFY
        lower.contains("tiktok.com") -> PlatformType.TIKTOK
        lower.contains("loom.com") -> PlatformType.LOOM
        Regex("""/videos/(?:watch|embed)/[0-9a-f-]{36,}""", RegexOption.IGNORE_CASE).containsMatchIn(trimmedUrl) -> PlatformType.PEERTUBE
        lower.contains("twitch.tv") -> PlatformType.TWITCH
        lower.contains("kick.com") -> PlatformType.KICK

        // Streaming manifests.
        Regex("""\.m3u8(\?|#|$)""", RegexOption.IGNORE_CASE).containsMatchIn(trimmedUrl) -> PlatformType.HLS
        Regex("""\.mpd(\?|#|$)""", RegexOption.IGNORE_CASE).containsMatchIn(trimmedUrl) -> PlatformType.DASH

        Regex("""\.(mp4|webm|ogg|ogv|mkv|avi|mov|m4v|m4a|mp3|wav|aac|flac)(\?|#|$)""", RegexOption.IGNORE_CASE).containsMatchIn(trimmedUrl) -> PlatformType.DIRECT
        // Check if URL looks like a direct video file (try to parse as URI)
        try {
            val uri = android.net.Uri.parse(trimmedUrl)
            uri.scheme != null && (uri.scheme == "http" || uri.scheme == "https" || uri.scheme == "file")
        } catch (e: Exception) {
            false
        } -> PlatformType.DIRECT
        else -> PlatformType.UNKNOWN
    }
}

/**
 * Extract YouTube video ID from URL
 */
fun extractYoutubeVideoId(url: String): String? {
    val patterns = listOf(
        Regex("""(?:youtube\.com/watch\?v=|youtu\.be/)([a-zA-Z0-9_-]{11})"""),
        Regex("""youtube\.com/embed/([a-zA-Z0-9_-]{11})"""),
        Regex("""youtube\.com/v/([a-zA-Z0-9_-]{11})"""),
        Regex("""youtube\.com/shorts/([a-zA-Z0-9_-]{11})"""),
        Regex("""youtube\.com/live/([a-zA-Z0-9_-]{11})""")
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
 * Extract Twitch channel name from URL (e.g. https://twitch.tv/<channel>).
 */
fun extractTwitchChannel(url: String): String? {
    val patterns = listOf(
        Regex("""twitch\.tv/([a-zA-Z0-9_]{3,25})(?:\?|/|#|$)""", RegexOption.IGNORE_CASE),
        Regex("""m\.twitch\.tv/([a-zA-Z0-9_]{3,25})(?:\?|/|#|$)""", RegexOption.IGNORE_CASE)
    )
    for (pattern in patterns) {
        val match = pattern.find(url)
        if (match != null) {
            val candidate = match.groupValues[1]
            // Exclude common non-channel paths.
            if (candidate.lowercase() !in setOf("videos", "directory", "p", "settings", "subscriptions")) {
                return candidate
            }
        }
    }
    return null
}

/**
 * Extract Twitch video id from URL (e.g. https://twitch.tv/videos/123456789).
 */
fun extractTwitchVideoId(url: String): String? {
    val patterns = listOf(
        Regex("""twitch\.tv/videos/(\d+)(?:\?|/|#|$)""", RegexOption.IGNORE_CASE),
        Regex("""m\.twitch\.tv/videos/(\d+)(?:\?|/|#|$)""", RegexOption.IGNORE_CASE)
    )
    for (pattern in patterns) {
        val match = pattern.find(url)
        if (match != null) return match.groupValues[1]
    }
    return null
}

/**
 * Extract Twitch clip id from URL (e.g. https://clips.twitch.tv/<clipId>).
 */
fun extractTwitchClipId(url: String): String? {
    val patterns = listOf(
        Regex("""clips\.twitch\.tv/([a-zA-Z0-9_-]+)(?:\?|/|#|$)""", RegexOption.IGNORE_CASE),
        Regex("""twitch\.tv/\w+/clip/([a-zA-Z0-9_-]+)(?:\?|/|#|$)""", RegexOption.IGNORE_CASE)
    )
    for (pattern in patterns) {
        val match = pattern.find(url)
        if (match != null) return match.groupValues[1]
    }
    return null
}

/**
 * Return a canonical Twitch URL if this looks like a playable Twitch target.
 */
fun canonicalizeTwitchUrl(url: String): String? {
    val videoId = extractTwitchVideoId(url)
    if (videoId != null) return "https://www.twitch.tv/videos/$videoId"

    val clipId = extractTwitchClipId(url)
    if (clipId != null) return "https://clips.twitch.tv/$clipId"

    val channel = extractTwitchChannel(url)
    if (channel != null) return "https://www.twitch.tv/$channel"

    return null
}

/**
 * Extract Kick channel name from URL (e.g. https://kick.com/<channel>).
 */
fun extractKickChannel(url: String): String? {
    val patterns = listOf(
        Regex("""kick\.com/([a-zA-Z0-9_\-]{2,50})(?:\?|/|#|$)""", RegexOption.IGNORE_CASE)
    )
    for (pattern in patterns) {
        val match = pattern.find(url)
        if (match != null) {
            val candidate = match.groupValues[1]
            // Exclude obvious non-channel paths.
            if (candidate.lowercase() !in setOf("categories", "discover", "search", "settings")) {
                return candidate
            }
        }
    }
    return null
}

/**
 * Return a canonical Kick URL if this looks like a Kick target.
 */
fun canonicalizeKickUrl(url: String): String? {
    val channel = extractKickChannel(url)
    if (channel != null) return "https://kick.com/$channel"
    return null
}

/**
 * Video player state
 */
data class VideoPlayerState(
    val url: String = "",
    val isPlaying: Boolean = false,
    val currentTime: Double = 0.0,
    val duration: Double = 0.0,
    val volume: Float = 1f,
    val isMuted: Boolean = false,
    val playbackSpeed: Float = 1f,
    val isBuffering: Boolean = false,
    val isReady: Boolean = false,
    val error: String? = null,
    val platform: PlatformType = PlatformType.UNKNOWN,
    // When room audio sync is disabled, these overrides control only the local device.
    // When null, fall back to the synced room values above.
    val localVolumeOverride: Float? = null,
    val localMutedOverride: Boolean? = null,
    // Timestamp of the last remote sync to prevent local progress from overwriting it immediately
    val lastRemoteSyncAt: Long = 0L
)

/**
 * True for sources whose top-level playback can't be embedded inline because
 * of DRM (Widevine / FairPlay / PlayReady) + X-Frame-Options: DENY on the
 * web side. Used by the Tier-3 CTA card on Android — Netflix is the only
 * one of these we actually drive in-app today (via NetflixWebPlayer).
 */
fun PlatformType.isTier3(): Boolean = when (this) {
    PlatformType.NETFLIX,
    PlatformType.PRIME,
    PlatformType.DISNEY_PLUS,
    PlatformType.HBO,
    PlatformType.HULU,
    PlatformType.APPLE_TV_PLUS,
    PlatformType.PARAMOUNT_PLUS,
    PlatformType.PEACOCK -> true
    else -> false
}

/** Human-friendly label — matches the web app's `platformDisplayName`. */
fun platformDisplayName(p: PlatformType): String = when (p) {
    PlatformType.YOUTUBE -> "YouTube"
    PlatformType.VIMEO -> "Vimeo"
    PlatformType.DAILYMOTION -> "Dailymotion"
    PlatformType.WISTIA -> "Wistia"
    PlatformType.SOUNDCLOUD -> "SoundCloud"
    PlatformType.SPOTIFY -> "Spotify"
    PlatformType.TIKTOK -> "TikTok"
    PlatformType.LOOM -> "Loom"
    PlatformType.PEERTUBE -> "PeerTube"
    PlatformType.TWITCH -> "Twitch"
    PlatformType.KICK -> "Kick"
    PlatformType.HLS -> "HLS stream"
    PlatformType.DASH -> "DASH stream"
    PlatformType.DIRECT -> "Direct video"
    PlatformType.NETFLIX -> "Netflix"
    PlatformType.PRIME -> "Prime Video"
    PlatformType.DISNEY_PLUS -> "Disney+"
    PlatformType.HBO -> "HBO Max"
    PlatformType.HULU -> "Hulu"
    PlatformType.APPLE_TV_PLUS -> "Apple TV+"
    PlatformType.PARAMOUNT_PLUS -> "Paramount+"
    PlatformType.PEACOCK -> "Peacock"
    PlatformType.UNKNOWN -> "this source"
}

/**
 * Best-known Android package name for each Tier-3 platform's native app, so
 * we can try to deep-link straight into it before falling back to the
 * browser. Returns null when we don't know one — Apple TV+ has no phone
 * Android app in most regions; we let the system handle the URL.
 */
fun platformAndroidPackage(p: PlatformType): String? = when (p) {
    PlatformType.NETFLIX -> "com.netflix.mediaclient"
    PlatformType.PRIME -> "com.amazon.avod.thirdpartyclient"
    PlatformType.DISNEY_PLUS -> "com.disney.disneyplus"
    PlatformType.HBO -> "com.wbd.stream"
    PlatformType.HULU -> "com.hulu.plus"
    PlatformType.PARAMOUNT_PLUS -> "com.cbs.app"
    PlatformType.PEACOCK -> "com.peacocktv.peacockandroid"
    PlatformType.APPLE_TV_PLUS -> null // no widely-available phone app
    else -> null
}
