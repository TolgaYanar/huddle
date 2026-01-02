package tv.wehuddle.app.ui.screens.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import tv.wehuddle.app.data.local.PreferencesManager
import tv.wehuddle.app.data.model.HomeUiState
import tv.wehuddle.app.data.repository.AuthRepository
import tv.wehuddle.app.data.repository.SavedRoomsRepository
import javax.inject.Inject

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val preferencesManager: PreferencesManager,
    private val authRepository: AuthRepository,
    private val savedRoomsRepository: SavedRoomsRepository
) : ViewModel() {
    
    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()
    
    init {
        viewModelScope.launch {
            preferencesManager.lastRoomId.collect { lastRoomId ->
                _uiState.update { it.copy(lastRoomId = lastRoomId) }
            }
        }

        // React to saved rooms changes (e.g., when saving/unsaving from Room screen)
        viewModelScope.launch {
            savedRoomsRepository.savedRooms.collect { rooms ->
                val user = _uiState.value.authUser
                if (user == null) {
                    _uiState.update { it.copy(savedRooms = emptyList()) }
                } else {
                    _uiState.update { it.copy(savedRooms = rooms.take(5)) }
                }
            }
        }

        viewModelScope.launch {
            authRepository.user.collect { user ->
                _uiState.update { it.copy(authUser = user) }
                refreshSavedRooms()
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            authRepository.logout()
            _uiState.update { it.copy(savedRooms = emptyList()) }
        }
    }

    fun refreshSavedRooms() {
        val user = _uiState.value.authUser
        if (user == null) {
            _uiState.update { it.copy(savedRooms = emptyList(), isLoading = false, error = null) }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                savedRoomsRepository.refresh()
                _uiState.update { it.copy(isLoading = false, error = null) }
            } catch (_: Exception) {
                _uiState.update { it.copy(isLoading = false, error = "Failed to load saved rooms") }
            }
        }
    }
    
    fun updateJoinInput(input: String) {
        _uiState.update { it.copy(joinInput = input) }
    }
    
    fun generateRoomId(): String {
        val alphabet = "23456789abcdefghjkmnpqrstuvwxyz"
        return (1..10)
            .map { alphabet.random() }
            .joinToString("")
    }
    
    fun normalizeRoomId(input: String): String {
        val raw = input.trim()
        if (raw.isEmpty()) return ""
        
        // Accept full invite links (e.g., http://host:3002/r/abc123)
        val match = Regex("""/r/([^/?#]+)""", RegexOption.IGNORE_CASE).find(raw)
        val extracted = match?.groupValues?.get(1)?.let { 
            java.net.URLDecoder.decode(it, "UTF-8") 
        } ?: raw
        
        val trimmed = extracted.trim().lowercase()
        // Keep only URL-safe chars; collapse whitespace/invalids to '-'
        val cleaned = trimmed
            .replace(Regex("""[^a-z0-9_-]+"""), "-")
            .replace(Regex("""-+"""), "-")
        return cleaned.trim('-')
    }
    
    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }
}
