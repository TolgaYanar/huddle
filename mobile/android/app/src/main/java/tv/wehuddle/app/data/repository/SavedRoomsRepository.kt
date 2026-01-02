package tv.wehuddle.app.data.repository

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import tv.wehuddle.app.data.network.HuddleApiService
import tv.wehuddle.app.data.network.SaveRoomRequest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SavedRoomsRepository @Inject constructor(
    private val api: HuddleApiService
) {

    private val _savedRooms = MutableStateFlow<List<String>>(emptyList())
    val savedRooms: StateFlow<List<String>> = _savedRooms.asStateFlow()

    suspend fun list(): List<String> {
        val rooms = api.listSavedRooms().rooms.map { it.roomId }
        _savedRooms.value = rooms
        return rooms
    }

    suspend fun save(roomId: String): String {
        val savedRoomId = api.saveRoom(SaveRoomRequest(roomId)).room.roomId
        // Update cached list optimistically (server is source of truth, but this avoids a refetch)
        val next = (_savedRooms.value + savedRoomId).distinct()
        _savedRooms.value = next
        return savedRoomId
    }

    suspend fun unsave(roomId: String) {
        api.unsaveRoom(roomId)
        _savedRooms.value = _savedRooms.value.filterNot { it == roomId }
    }

    suspend fun refresh(): List<String> = list()
}
