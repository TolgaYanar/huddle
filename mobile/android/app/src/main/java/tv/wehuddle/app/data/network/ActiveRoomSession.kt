package tv.wehuddle.app.data.network

internal data class RoomJoinRequest(
    val roomId: String,
    val password: String?,
)

/** Keeps reconnect credentials in memory for the currently active room only. */
internal class ActiveRoomSession {
    private var request: RoomJoinRequest? = null

    @Synchronized
    fun remember(roomId: String, password: String?): RoomJoinRequest {
        return RoomJoinRequest(roomId, password).also { request = it }
    }

    @Synchronized
    fun reconnectRequest(): RoomJoinRequest? = request

    @Synchronized
    fun activeRoomId(): String? = request?.roomId

    @Synchronized
    fun leave(roomId: String) {
        if (request?.roomId == roomId) request = null
    }

    @Synchronized
    fun clear() {
        request = null
    }
}
