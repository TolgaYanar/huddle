package tv.wehuddle.app.data.model

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Video metadata result
 */
data class VideoInfo(
    val title: String,
    val thumbnail: String?,
    val channelTitle: String?,
    val duration: Double?,
    val isLive: Boolean
)

/**
 * Fetches video metadata from various platforms
 */
object VideoInfoFetcher {
    
    /**
     * Fetch video info for any supported URL
     */
    suspend fun fetchVideoInfo(videoUrl: String): VideoInfo? = withContext(Dispatchers.IO) {
        try {
            // Try YouTube first
            val youtubeId = extractYoutubeVideoId(videoUrl)
            if (youtubeId != null) {
                return@withContext fetchYouTubeInfo(youtubeId)
            }
            
            // Try Twitch channel
            val twitchChannel = extractTwitchChannel(videoUrl)
            if (twitchChannel != null) {
                return@withContext VideoInfo(
                    title = "$twitchChannel on Twitch",
                    thumbnail = null,
                    channelTitle = twitchChannel,
                    duration = null,
                    isLive = true
                )
            }
            
            // Try Twitch video
            val twitchVideoId = extractTwitchVideoId(videoUrl)
            if (twitchVideoId != null) {
                return@withContext VideoInfo(
                    title = "Twitch VOD $twitchVideoId",
                    thumbnail = null,
                    channelTitle = null,
                    duration = null,
                    isLive = false
                )
            }
            
            // Try Kick
            val kickChannel = extractKickChannel(videoUrl)
            if (kickChannel != null) {
                return@withContext fetchKickInfo(kickChannel)
            }
            
            // Generic URL - try to extract title from URL
            return@withContext VideoInfo(
                title = extractTitleFromUrl(videoUrl),
                thumbnail = null,
                channelTitle = null,
                duration = null,
                isLive = false
            )
        } catch (e: Exception) {
            null
        }
    }
    
    /**
     * Fetch YouTube video info using oEmbed API (no API key required)
     */
    private fun fetchYouTubeInfo(videoId: String): VideoInfo {
        try {
            val oembedUrl = "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=$videoId&format=json"
            val connection = URL(oembedUrl).openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.connectTimeout = 5000
            connection.readTimeout = 5000
            
            if (connection.responseCode == HttpURLConnection.HTTP_OK) {
                val response = connection.inputStream.bufferedReader().readText()
                val json = JSONObject(response)
                
                return VideoInfo(
                    title = json.optString("title", "YouTube Video ($videoId)"),
                    thumbnail = "https://i.ytimg.com/vi/$videoId/hqdefault.jpg",
                    channelTitle = json.optString("author_name", null),
                    duration = null, // oEmbed doesn't provide duration
                    isLive = false
                )
            }
        } catch (e: Exception) {
            // Fall through to default
        }
        
        // Default fallback - at least get thumbnail
        return VideoInfo(
            title = "YouTube Video ($videoId)",
            thumbnail = "https://i.ytimg.com/vi/$videoId/hqdefault.jpg",
            channelTitle = null,
            duration = null,
            isLive = false
        )
    }
    
    /**
     * Fetch Kick channel info
     */
    private fun fetchKickInfo(channel: String): VideoInfo {
        try {
            val apiUrl = "https://kick.com/api/v1/channels/$channel"
            val connection = URL(apiUrl).openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.setRequestProperty("Accept", "application/json")
            connection.connectTimeout = 5000
            connection.readTimeout = 5000
            
            if (connection.responseCode == HttpURLConnection.HTTP_OK) {
                val response = connection.inputStream.bufferedReader().readText()
                val json = JSONObject(response)
                
                val user = json.optJSONObject("user")
                val username = user?.optString("username") ?: channel
                val profilePic = user?.optString("profile_pic")
                
                val livestream = json.optJSONObject("livestream")
                val isLive = livestream != null
                
                val title = if (isLive) {
                    livestream?.optString("session_title") ?: "$username on Kick"
                } else {
                    "$username on Kick"
                }
                
                val thumbnail = if (isLive) {
                    livestream?.optJSONObject("thumbnail")?.optString("url") ?: profilePic
                } else {
                    profilePic
                }
                
                return VideoInfo(
                    title = title,
                    thumbnail = thumbnail,
                    channelTitle = username,
                    duration = null,
                    isLive = isLive
                )
            }
        } catch (e: Exception) {
            // Fall through to default
        }
        
        return VideoInfo(
            title = "$channel on Kick",
            thumbnail = null,
            channelTitle = channel,
            duration = null,
            isLive = true
        )
    }
    
    /**
     * Extract Kick channel from URL
     */
    private fun extractKickChannel(url: String): String? {
        val pattern = Regex("""kick\.com/([a-zA-Z0-9_]+)(?:\?|/|#|$)""", RegexOption.IGNORE_CASE)
        val match = pattern.find(url)
        if (match != null) {
            val channel = match.groupValues[1]
            if (channel.lowercase() !in setOf("categories", "browse", "following")) {
                return channel
            }
        }
        return null
    }
    
    /**
     * Extract a readable title from URL
     */
    private fun extractTitleFromUrl(url: String): String {
        return try {
            val parsed = URL(url)
            val host = parsed.host.removePrefix("www.")
            val path = parsed.path.trim('/')
            if (path.isNotEmpty()) {
                "$host - $path"
            } else {
                host
            }
        } catch (e: Exception) {
            "Video"
        }
    }
}
