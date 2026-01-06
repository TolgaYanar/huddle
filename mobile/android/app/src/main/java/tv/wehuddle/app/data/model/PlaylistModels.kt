package tv.wehuddle.app.data.model

import kotlinx.serialization.Serializable

/**
 * A single item in a playlist
 */
@Serializable
data class PlaylistItem(
    val id: String,
    val videoUrl: String,
    val title: String,
    val addedBy: String,
    val addedByUsername: String? = null,
    val addedAt: Long,
    val duration: Double? = null,
    val thumbnail: String? = null
)

/**
 * Playlist settings
 */
@Serializable
data class PlaylistSettings(
    val loop: Boolean = false,
    val shuffle: Boolean = false,
    val autoPlay: Boolean = true
)

/**
 * A playlist with items and settings
 */
@Serializable
data class Playlist(
    val id: String,
    val roomId: String,
    val name: String,
    val description: String? = null,
    val items: List<PlaylistItem> = emptyList(),
    val createdBy: String,
    val createdByUsername: String? = null,
    val createdAt: Long,
    val updatedAt: Long,
    val isDefault: Boolean = false,
    val settings: PlaylistSettings = PlaylistSettings()
)

/**
 * State data for playlists in a room
 */
@Serializable
data class PlaylistStateData(
    val roomId: String,
    val playlists: List<Playlist> = emptyList(),
    val activePlaylistId: String? = null,
    val currentItemIndex: Int = 0
)

/**
 * Data sent when a playlist item is played
 */
@Serializable
data class PlaylistItemPlayedData(
    val roomId: String,
    val playlistId: String,
    val itemId: String,
    val itemIndex: Int,
    val videoUrl: String,
    val title: String
)
