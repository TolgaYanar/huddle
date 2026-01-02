package tv.wehuddle.app.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "huddle_prefs")

/**
 * Local preferences storage using DataStore
 */
@Singleton
class PreferencesManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    
    companion object {
        private val LAST_ROOM_ID = stringPreferencesKey("last_room_id")
        private val USER_NICKNAME = stringPreferencesKey("user_nickname")
        private val PREFERRED_VOLUME = stringPreferencesKey("preferred_volume")
        private val PUSH_TO_TALK_KEY = stringPreferencesKey("push_to_talk_key")

        private val AUTH_TOKEN = stringPreferencesKey("auth_token")
        private val AUTH_USERNAME = stringPreferencesKey("auth_username")
    }
    
    /**
     * Get the last visited room ID
     */
    val lastRoomId: Flow<String?> = context.dataStore.data.map { preferences ->
        preferences[LAST_ROOM_ID]
    }
    
    /**
     * Save the last visited room ID
     */
    suspend fun saveLastRoomId(roomId: String) {
        context.dataStore.edit { preferences ->
            preferences[LAST_ROOM_ID] = roomId
        }
    }
    
    /**
     * Clear the last visited room ID
     */
    suspend fun clearLastRoomId() {
        context.dataStore.edit { preferences ->
            preferences.remove(LAST_ROOM_ID)
        }
    }
    
    /**
     * Get the user's nickname
     */
    val userNickname: Flow<String?> = context.dataStore.data.map { preferences ->
        preferences[USER_NICKNAME]
    }
    
    /**
     * Save the user's nickname
     */
    suspend fun saveUserNickname(nickname: String) {
        context.dataStore.edit { preferences ->
            preferences[USER_NICKNAME] = nickname
        }
    }
    
    /**
     * Get preferred volume (0.0 - 1.0)
     */
    val preferredVolume: Flow<Float> = context.dataStore.data.map { preferences ->
        preferences[PREFERRED_VOLUME]?.toFloatOrNull() ?: 1f
    }
    
    /**
     * Save preferred volume
     */
    suspend fun savePreferredVolume(volume: Float) {
        context.dataStore.edit { preferences ->
            preferences[PREFERRED_VOLUME] = volume.toString()
        }
    }

    /**
     * Auth token for API requests (Bearer token)
     */
    val authToken: Flow<String?> = context.dataStore.data.map { preferences ->
        preferences[AUTH_TOKEN]
    }

    suspend fun saveAuthToken(token: String) {
        context.dataStore.edit { preferences ->
            preferences[AUTH_TOKEN] = token
        }
    }

    suspend fun clearAuthToken() {
        context.dataStore.edit { preferences ->
            preferences.remove(AUTH_TOKEN)
        }
    }

    /**
     * Convenience cached username (not security-sensitive)
     */
    val authUsername: Flow<String?> = context.dataStore.data.map { preferences ->
        preferences[AUTH_USERNAME]
    }

    suspend fun saveAuthUsername(username: String) {
        context.dataStore.edit { preferences ->
            preferences[AUTH_USERNAME] = username
        }
    }

    suspend fun clearAuthUsername() {
        context.dataStore.edit { preferences ->
            preferences.remove(AUTH_USERNAME)
        }
    }
}
