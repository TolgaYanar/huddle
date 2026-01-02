package tv.wehuddle.app.data.network

import kotlinx.serialization.Serializable

@Serializable
data class AuthRequest(
    val username: String,
    val password: String
)

@Serializable
data class AuthUserDto(
    val id: String,
    val username: String
)

@Serializable
data class AuthTokenResponse(
    val token: String,
    val user: AuthUserDto
)

@Serializable
data class MeResponse(
    val user: AuthUserDto? = null
)

@Serializable
data class SavedRoomDto(
    val roomId: String,
    val createdAt: String? = null
)

@Serializable
data class SavedRoomsResponse(
    val rooms: List<SavedRoomDto>
)

@Serializable
data class SaveRoomRequest(
    val roomId: String
)

@Serializable
data class SaveRoomResponse(
    val room: SavedRoomDto
)

@Serializable
data class OkResponse(
    val ok: Boolean
)
