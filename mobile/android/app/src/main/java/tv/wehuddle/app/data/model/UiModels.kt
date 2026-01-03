package tv.wehuddle.app.data.model

/**
 * Represents a log entry in the activity feed
 */
data class ActivityLogEntry(
    val id: String,
    val kind: ActivityLogKind,
    val message: String,
    val timestamp: Long,
    val senderId: String? = null,
    val senderName: String? = null
)

/**
 * Types of activity log entries
 */
enum class ActivityLogKind {
    JOIN,
    LEAVE,
    PLAY,
    PAUSE,
    SEEK,
    URL_CHANGE,
    CHAT,
    SYSTEM
}

/**
 * Represents a participant in the room
 */
data class Participant(
    val id: String,
    val username: String? = null,
    val isLocal: Boolean = false,
    val isHost: Boolean = false,
    val isSpeaking: Boolean = false,
    val mediaState: WebRTCMediaState = WebRTCMediaState()
)

/**
 * Room connection state
 */
enum class ConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    RECONNECTING,
    ERROR
}

/**
 * Complete room UI state
 */
data class RoomUiState(
    val roomId: String = "",
    val userId: String = "",
    val hostId: String? = null,
    val connectionState: ConnectionState = ConnectionState.DISCONNECTED,
    val participants: List<Participant> = emptyList(),
    val activityLog: List<ActivityLogEntry> = emptyList(),
    val chatMessages: List<ChatMessage> = emptyList(),
    val videoState: VideoPlayerState = VideoPlayerState(),
    val audioSyncEnabled: Boolean = true,
    val hasRoomPassword: Boolean = false,
    val passwordRequired: Boolean = false,
    val passwordError: String? = null,
    val wheelEntries: List<String> = emptyList(),
    val wheelLastSpin: WheelSpinData? = null,
    val isCallCollapsed: Boolean = false,
    val isActivityCollapsed: Boolean = false,
    val localMediaState: WebRTCMediaState = WebRTCMediaState(),
    val isSpeaking: Boolean = false,
    val error: String? = null
)

/**
 * Home screen UI state
 */
data class HomeUiState(
    val lastRoomId: String? = null,
    val joinInput: String = "",
    val authUser: AuthUser? = null,
    val savedRooms: List<String> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null
)
