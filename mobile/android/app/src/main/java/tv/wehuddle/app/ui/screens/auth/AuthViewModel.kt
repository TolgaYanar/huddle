package tv.wehuddle.app.ui.screens.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import retrofit2.HttpException
import tv.wehuddle.app.data.repository.AuthRepository
import java.io.IOException
import javax.inject.Inject

data class AuthUiState(
    val username: String = "",
    val password: String = "",
    val confirmPassword: String = "",
    val isLoading: Boolean = false,
    val error: String? = null,
    val showPasswordRequirements: Boolean = false
) {
    // Username validation
    val isUsernameLengthValid: Boolean get() = username.length in 3..20
    val isUsernameCharsValid: Boolean get() = username.matches(Regex("^[a-z0-9_]*$"))
    val isUsernameValid: Boolean get() = isUsernameLengthValid && isUsernameCharsValid && username.isNotEmpty()
    
    // Password validation
    val hasMinLength: Boolean get() = password.length >= 8
    val hasLowercase: Boolean get() = password.any { it.isLowerCase() }
    val hasUppercase: Boolean get() = password.any { it.isUpperCase() }
    val hasNumber: Boolean get() = password.any { it.isDigit() }
    val isPasswordValid: Boolean get() = hasMinLength && hasLowercase && hasUppercase && hasNumber
    
    // Confirm password
    val passwordsMatch: Boolean get() = password == confirmPassword && confirmPassword.isNotEmpty()
    
    // Can submit register
    val canRegister: Boolean get() = isUsernameValid && isPasswordValid && passwordsMatch && !isLoading
    
    // Can submit login
    val canLogin: Boolean get() = username.isNotBlank() && password.isNotBlank() && !isLoading
}

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val authRepository: AuthRepository
) : ViewModel() {
    private val _uiState = MutableStateFlow(AuthUiState())
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    fun updateUsername(value: String) {
        // Auto-lowercase and filter invalid characters
        val filtered = value.lowercase().filter { it.isLetterOrDigit() || it == '_' }
        _uiState.update { it.copy(username = filtered, error = null) }
    }

    fun updatePassword(value: String) {
        _uiState.update { it.copy(password = value, error = null, showPasswordRequirements = true) }
    }

    fun updateConfirmPassword(value: String) {
        _uiState.update { it.copy(confirmPassword = value, error = null) }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }

    fun login(onSuccess: () -> Unit) {
        val state = _uiState.value
        if (!state.canLogin) {
            _uiState.update { it.copy(error = "Enter username and password") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                authRepository.login(state.username.trim(), state.password)
                _uiState.update { it.copy(isLoading = false) }
                onSuccess()
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = toAuthErrorMessage(e, isRegister = false)
                    )
                }
            }
        }
    }

    fun register(onSuccess: () -> Unit) {
        val state = _uiState.value
        if (!state.canRegister) {
            val error = when {
                !state.isUsernameValid -> "Please fix username issues"
                !state.isPasswordValid -> "Please fix password requirements"
                !state.passwordsMatch -> "Passwords do not match"
                else -> "Please fill in all fields correctly"
            }
            _uiState.update { it.copy(error = error) }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try {
                authRepository.register(state.username.trim(), state.password)
                _uiState.update { it.copy(isLoading = false) }
                onSuccess()
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = toAuthErrorMessage(e, isRegister = true)
                    )
                }
            }
        }
    }

    private fun toAuthErrorMessage(e: Exception, isRegister: Boolean): String {
        // Network/connectivity
        if (e is IOException) {
            return "Can’t reach the server. Check your connection and the app’s API_BASE_URL."
        }

        // HTTP errors from server (Express API returns { error, hint? })
        if (e is HttpException) {
            val errorBody = try {
                e.response()?.errorBody()?.string()
            } catch (_: Exception) {
                null
            }

            val code = extractJsonStringField(errorBody, "error")
            val hint = extractJsonStringField(errorBody, "hint")

            val base = when (code) {
                "invalid_username" -> "Username must be 3–20 chars: a-z, 0-9, _."
                "invalid_password" -> "Password must be at least 8 characters."
                "username_taken" -> "That username is already taken."
                "invalid_credentials" -> if (isRegister) {
                    "Invalid username or password."
                } else {
                    "Wrong username or password."
                }
                "db_unavailable" -> "Server is temporarily unavailable. Try again shortly."
                "server_error" -> "Server error. Try again."
                else -> when (e.code()) {
                    401 -> if (isRegister) "Invalid username or password." else "Wrong username or password."
                    409 -> "That username is already taken."
                    503 -> "Server is temporarily unavailable. Try again shortly."
                    else -> if (isRegister) "Register failed. Please try again." else "Login failed. Please try again."
                }
            }

            return if (!hint.isNullOrBlank() && code != "invalid_username" && code != "invalid_password") {
                "$base ($hint)"
            } else {
                base
            }
        }

        // Fallback
        return if (isRegister) "Register failed. Please try again." else "Login failed. Please try again."
    }

    private fun extractJsonStringField(json: String?, field: String): String? {
        if (json.isNullOrBlank()) return null
        val regex = Regex("\"$field\"\\s*:\\s*\"([^\"]+)\"")
        return regex.find(json)?.groupValues?.getOrNull(1)
    }
}
