package tv.wehuddle.app.data.repository

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import tv.wehuddle.app.data.local.PreferencesManager
import tv.wehuddle.app.data.model.AuthUser
import tv.wehuddle.app.data.network.AuthRequest
import tv.wehuddle.app.data.network.AuthTokenProvider
import tv.wehuddle.app.data.network.HuddleApiService
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    private val api: HuddleApiService,
    private val tokenProvider: AuthTokenProvider,
    private val preferencesManager: PreferencesManager
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _user = MutableStateFlow<AuthUser?>(null)
    val user: StateFlow<AuthUser?> = _user.asStateFlow()

    init {
        // Hydrate auth state when token changes (app start, login, logout)
        scope.launch {
            tokenProvider.token.collectLatest { token ->
                if (token.isNullOrBlank()) {
                    _user.value = null
                    return@collectLatest
                }
                try {
                    val me = api.me().user
                    if (me == null) {
                        // Token missing/invalid on server; clear local auth state.
                        tokenProvider.clear()
                        _user.value = null
                        return@collectLatest
                    }

                    val authUser = AuthUser(id = me.id, username = me.username)
                    preferencesManager.saveAuthUsername(authUser.username)
                    _user.value = authUser
                } catch (_: Exception) {
                    // If /me fails (401, offline, bad JSON), treat as logged out.
                    // Clearing avoids getting stuck with an invalid token.
                    try {
                        tokenProvider.clear()
                    } catch (_: Exception) {
                        // ignore
                    }
                    _user.value = null
                }
            }
        }
    }

    suspend fun login(username: String, password: String) {
        val res = api.loginToken(AuthRequest(username, password))
        tokenProvider.setToken(res.token)
        preferencesManager.saveAuthUsername(res.user.username)
        _user.value = AuthUser(id = res.user.id, username = res.user.username)
    }

    suspend fun register(username: String, password: String) {
        val res = api.registerToken(AuthRequest(username, password))
        tokenProvider.setToken(res.token)
        preferencesManager.saveAuthUsername(res.user.username)
        _user.value = AuthUser(id = res.user.id, username = res.user.username)
    }

    suspend fun logout() {
        try {
            api.logout()
        } catch (_: Exception) {
            // ignore
        }
        tokenProvider.clear()
        _user.value = null
    }
}
