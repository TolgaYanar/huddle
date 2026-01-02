package tv.wehuddle.app.data.network

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import tv.wehuddle.app.data.local.PreferencesManager
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthTokenProvider @Inject constructor(
    private val preferencesManager: PreferencesManager
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _token = MutableStateFlow<String?>(null)
    val token: StateFlow<String?> = _token.asStateFlow()

    init {
        scope.launch {
            preferencesManager.authToken.collectLatest { value ->
                _token.value = value
            }
        }
    }

    fun currentToken(): String? = _token.value

    suspend fun setToken(token: String) {
        preferencesManager.saveAuthToken(token)
    }

    suspend fun clear() {
        preferencesManager.clearAuthToken()
        preferencesManager.clearAuthUsername()
    }
}
