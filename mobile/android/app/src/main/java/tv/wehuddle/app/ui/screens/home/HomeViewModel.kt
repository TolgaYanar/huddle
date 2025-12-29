package tv.wehuddle.app.ui.screens.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import tv.wehuddle.app.data.local.PreferencesManager
import tv.wehuddle.app.data.model.HomeUiState
import javax.inject.Inject

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val preferencesManager: PreferencesManager
) : ViewModel() {
    
    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()
    
    init {
        viewModelScope.launch {
            preferencesManager.lastRoomId.collect { lastRoomId ->
                _uiState.update { it.copy(lastRoomId = lastRoomId) }
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
