package tv.wehuddle.app.data.model

import kotlinx.serialization.Serializable

/**
 * Sync action types for video synchronization
 */
@Serializable
enum class SyncAction {
    play,
    pause,
    seek,
    change_url,
    set_mute,
    set_speed,
    set_volume,
    set_audio_sync
}

/**
 * Data sent when syncing video playback
 */
@Serializable
data class SyncData(
    val roomId: String,
    val action: SyncAction,
    val timestamp: Double,
    val videoUrl: String? = null,
    val volume: Float? = null,
    val isMuted: Boolean? = null,
    val playbackSpeed: Float? = null,
    val audioSyncEnabled: Boolean? = null,
    val senderId: String? = null,
    val senderUsername: String? = null
)

/**
 * Current state of a room
 */
@Serializable
data class RoomState(
    val roomId: String,
    val videoUrl: String? = null,
    val timestamp: Double? = null,
    val action: SyncAction? = null,
    val isPlaying: Boolean? = null,
    val volume: Float? = null,
    val isMuted: Boolean? = null,
    val playbackSpeed: Float? = null,
    val audioSyncEnabled: Boolean? = null,
    val updatedAt: Long? = null,
    val senderId: String? = null,
    val senderUsername: String? = null
)

/**
 * Chat message in a room
 */
@Serializable
data class ChatMessage(
    val id: String,
    val roomId: String,
    val senderId: String,
    val senderUsername: String? = null,
    val text: String,
    val createdAt: String
)

/**
 * Chat history response
 */
@Serializable
data class ChatHistory(
    val roomId: String,
    val messages: List<ChatMessage>
)

/**
 * Activity event types
 */
@Serializable
enum class ActivityKind {
    sync,
    join,
    leave,
    chat
}

/**
 * Activity event in a room
 */
@Serializable
data class ActivityEvent(
    val id: String,
    val roomId: String,
    val kind: String,
    val action: String? = null,
    val timestamp: Double? = null,
    val videoUrl: String? = null,
    val senderId: String? = null,
    val senderUsername: String? = null,
    val createdAt: String
)

/**
 * Activity history response
 */
@Serializable
data class ActivityHistory(
    val roomId: String,
    val events: List<ActivityEvent>
)

/**
 * Room users data
 */
@Serializable
data class RoomUsersData(
    val roomId: String,
    val users: List<String>,
    val usernames: Map<String, String?>? = null,
    val mediaStates: Map<String, WebRTCMediaState>? = null,
    val hostId: String? = null
)

/**
 * Room password status
 */
@Serializable
data class RoomPasswordStatus(
    val roomId: String,
    val hasPassword: Boolean
)

/**
 * Room password required response
 */
@Serializable
data class RoomPasswordRequired(
    val roomId: String,
    val reason: String? = null // "required" or "invalid"
)

/**
 * Wheel spin data
 */
@Serializable
data class WheelSpinData(
    val index: Int,
    val result: String,
    val entryCount: Int,
    val spunAt: Long,
    val senderId: String? = null
)

/**
 * Wheel state data
 */
@Serializable
data class WheelState(
    val roomId: String,
    val entries: List<String>,
    val lastSpin: WheelSpinData? = null
)

/**
 * Wheel spun event data
 */
@Serializable
data class WheelSpunData(
    val roomId: String,
    val index: Int,
    val result: String,
    val entryCount: Int,
    val spunAt: Long,
    val senderId: String? = null,
    val entries: List<String>? = null
)

/**
 * WebRTC media state for a user
 */
@Serializable
data class WebRTCMediaState(
    val mic: Boolean = false,
    val cam: Boolean = false,
    val screen: Boolean = false
)

/**
 * WebRTC signaling: offer
 */
@Serializable
data class WebRTCOffer(
    val fromId: String,
    val toId: String,
    val sdp: String
)

/**
 * WebRTC signaling: answer
 */
@Serializable
data class WebRTCAnswer(
    val fromId: String,
    val toId: String,
    val sdp: String
)

/**
 * WebRTC signaling: ICE candidate
 */
@Serializable
data class WebRTCIceCandidate(
    val fromId: String,
    val toId: String,
    val candidate: String,
    val sdpMid: String?,
    val sdpMLineIndex: Int?
)

/**
 * User join event
 */
@Serializable
data class UserJoinedEvent(
    val roomId: String,
    val socketId: String,
    val username: String? = null
)

/**
 * User leave event
 */
@Serializable
data class UserLeftEvent(
    val roomId: String,
    val socketId: String,
    val username: String? = null
)
