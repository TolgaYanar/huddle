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
        Regex("""youtube\.com/v/([a-zA-Z0-9_-]{11})""")
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
    val platform: PlatformType = PlatformType.UNKNOWN
)
