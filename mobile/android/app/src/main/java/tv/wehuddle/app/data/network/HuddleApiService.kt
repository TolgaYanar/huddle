package tv.wehuddle.app.data.network

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

interface HuddleApiService {
    @POST("auth/login-token")
    suspend fun loginToken(@Body request: AuthRequest): AuthTokenResponse

    @POST("auth/register-token")
    suspend fun registerToken(@Body request: AuthRequest): AuthTokenResponse

    @GET("auth/me")
    suspend fun me(): MeResponse

    @GET("saved-rooms")
    suspend fun listSavedRooms(): SavedRoomsResponse

    @POST("saved-rooms")
    suspend fun saveRoom(@Body request: SaveRoomRequest): SaveRoomResponse

    @DELETE("saved-rooms/{roomId}")
    suspend fun unsaveRoom(@Path("roomId") roomId: String): OkResponse

    @POST("auth/logout")
    suspend fun logout(): OkResponse
}
