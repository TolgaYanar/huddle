package tv.wehuddle.app.data.model

/**
 * Supported video platform types
 */
enum class PlatformType {
    YOUTUBE,
    TWITCH,
    KICK,
    DIRECT,
    PRIME,
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
    private val capabilities = mapOf(
        PlatformType.YOUTUBE to PlatformCapabilities(
            canPlay = true,
            canPause = true,
            canSeek = true,
            canMute = true,
            canChangeSpeed = true,
            canChangeVolume = true,
            canGetDuration = true,
            canGetCurrentTime = true,
            speedOptions = listOf(0.25f, 0.5f, 0.75f, 1f, 1.25f, 1.5f, 1.75f, 2f)
        ),
        PlatformType.DIRECT to PlatformCapabilities(
            canPlay = true,
            canPause = true,
            canSeek = true,
            canMute = true,
            canChangeSpeed = true,
            canChangeVolume = true,
            canGetDuration = true,
            canGetCurrentTime = true,
            speedOptions = listOf(0.25f, 0.5f, 0.75f, 1f, 1.25f, 1.5f, 1.75f, 2f, 2.5f, 3f)
        ),
        PlatformType.TWITCH to PlatformCapabilities(
            canPlay = false,
            canPause = false,
            canSeek = false,
            canMute = false,
            canChangeSpeed = false,
            canChangeVolume = false,
            canGetDuration = false,
            canGetCurrentTime = false,
            speedOptions = emptyList()
        ),
        PlatformType.KICK to PlatformCapabilities(
            canPlay = false,
            canPause = false,
            canSeek = false,
            canMute = false,
            canChangeSpeed = false,
            canChangeVolume = false,
            canGetDuration = false,
            canGetCurrentTime = false,
            speedOptions = emptyList()
        ),
        PlatformType.PRIME to PlatformCapabilities(
            canPlay = false,
            canPause = false,
            canSeek = false,
            canMute = false,
            canChangeSpeed = false,
            canChangeVolume = false,
            canGetDuration = false,
            canGetCurrentTime = false,
            speedOptions = emptyList()
        ),
        PlatformType.UNKNOWN to PlatformCapabilities(
            canPlay = true,
            canPause = true,
            canSeek = true,
            canMute = true,
            canChangeSpeed = true,
            canChangeVolume = true,
            canGetDuration = true,
            canGetCurrentTime = true,
            speedOptions = listOf(0.5f, 0.75f, 1f, 1.25f, 1.5f, 2f)
        )
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
        lower.contains("youtube.com") || lower.contains("youtu.be") -> PlatformType.YOUTUBE
        lower.contains("twitch.tv") -> PlatformType.TWITCH
        lower.contains("kick.com") -> PlatformType.KICK
        lower.contains("primevideo") || lower.contains("amazon.com/gp/video") -> PlatformType.PRIME
        Regex("""\.(mp4|webm|ogg|m3u8|mkv|avi|mov)(\?|#|$)""", RegexOption.IGNORE_CASE).containsMatchIn(trimmedUrl) -> PlatformType.DIRECT
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
    val localMutedOverride: Boolean? = null
)
