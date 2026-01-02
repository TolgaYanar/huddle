package tv.wehuddle.app.ui.screens.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import tv.wehuddle.app.ui.components.GlassCard
import tv.wehuddle.app.ui.components.HuddlePasswordField
import tv.wehuddle.app.ui.components.HuddlePrimaryButton
import tv.wehuddle.app.ui.components.HuddleSecondaryButton
import tv.wehuddle.app.ui.components.HuddleTextField
import tv.wehuddle.app.ui.theme.Emerald500
import tv.wehuddle.app.ui.theme.Rose500
import tv.wehuddle.app.ui.theme.Slate400
import tv.wehuddle.app.ui.theme.Slate50
import tv.wehuddle.app.ui.theme.Slate500
import tv.wehuddle.app.ui.theme.Slate900
import tv.wehuddle.app.ui.theme.Slate950

@Composable
private fun RequirementCheck(
    text: String,
    isValid: Boolean,
    isEmpty: Boolean = false
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Icon(
            imageVector = if (isValid) Icons.Default.Check else Icons.Default.Close,
            contentDescription = null,
            modifier = Modifier.size(14.dp),
            tint = when {
                isEmpty -> Slate500
                isValid -> Emerald500
                else -> Rose500
            }
        )
        Text(
            text = text,
            style = TextStyle(
                color = when {
                    isEmpty -> Slate500
                    isValid -> Emerald500
                    else -> Rose500
                },
                fontSize = 12.sp
            )
        )
    }
}

@Composable
fun RegisterScreen(
    onBack: () -> Unit,
    onGoToLogin: () -> Unit,
    onSuccess: () -> Unit,
    viewModel: AuthViewModel = hiltViewModel()
) {
    val uiState = viewModel.uiState.collectAsStateWithLifecycle().value
    val scrollState = rememberScrollState()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Slate950)
            .padding(horizontal = 24.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .verticalScroll(scrollState),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(Modifier.height(24.dp))
            
            GlassCard(modifier = Modifier.widthIn(max = 420.dp)) {
                Text(
                    text = "Register",
                    style = TextStyle(
                        color = Slate50,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "Pick a username to save rooms.",
                    style = TextStyle(color = Slate400, fontSize = 14.sp)
                )

                Spacer(Modifier.height(16.dp))

                // Username field
                Text(
                    text = "Username",
                    style = TextStyle(color = Slate400, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                )
                Spacer(Modifier.height(4.dp))
                HuddleTextField(
                    value = uiState.username,
                    onValueChange = viewModel::updateUsername,
                    placeholder = "Enter username",
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !uiState.isLoading
                )
                
                // Username requirements
                if (uiState.username.isNotEmpty()) {
                    Spacer(Modifier.height(8.dp))
                    RequirementCheck(
                        text = "3-20 characters",
                        isValid = uiState.isUsernameLengthValid
                    )
                    RequirementCheck(
                        text = "Only lowercase letters, numbers, underscore",
                        isValid = uiState.isUsernameCharsValid
                    )
                }

                Spacer(Modifier.height(14.dp))

                // Password field
                Text(
                    text = "Password",
                    style = TextStyle(color = Slate400, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                )
                Spacer(Modifier.height(4.dp))
                HuddlePasswordField(
                    value = uiState.password,
                    onValueChange = viewModel::updatePassword,
                    placeholder = "Enter password",
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !uiState.isLoading
                )
                
                // Password requirements - always show when password has content
                if (uiState.showPasswordRequirements || uiState.password.isNotEmpty()) {
                    Spacer(Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            RequirementCheck(
                                text = "8+ characters",
                                isValid = uiState.hasMinLength,
                                isEmpty = uiState.password.isEmpty()
                            )
                            RequirementCheck(
                                text = "Lowercase (a-z)",
                                isValid = uiState.hasLowercase,
                                isEmpty = uiState.password.isEmpty()
                            )
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            RequirementCheck(
                                text = "Uppercase (A-Z)",
                                isValid = uiState.hasUppercase,
                                isEmpty = uiState.password.isEmpty()
                            )
                            RequirementCheck(
                                text = "Number (0-9)",
                                isValid = uiState.hasNumber,
                                isEmpty = uiState.password.isEmpty()
                            )
                        }
                    }
                }

                Spacer(Modifier.height(14.dp))

                // Confirm password field
                Text(
                    text = "Confirm Password",
                    style = TextStyle(color = Slate400, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                )
                Spacer(Modifier.height(4.dp))
                HuddlePasswordField(
                    value = uiState.confirmPassword,
                    onValueChange = viewModel::updateConfirmPassword,
                    placeholder = "Confirm password",
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !uiState.isLoading
                )
                
                // Password match indicator
                if (uiState.confirmPassword.isNotEmpty()) {
                    Spacer(Modifier.height(8.dp))
                    RequirementCheck(
                        text = if (uiState.passwordsMatch) "Passwords match" else "Passwords do not match",
                        isValid = uiState.passwordsMatch
                    )
                }

                if (uiState.error != null) {
                    Spacer(Modifier.height(10.dp))
                    Surface(color = Slate900, shape = MaterialTheme.shapes.medium) {
                        Text(
                            text = uiState.error,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                            style = TextStyle(color = Rose500, fontSize = 13.sp)
                        )
                    }
                }

                Spacer(Modifier.height(16.dp))

                HuddlePrimaryButton(
                    onClick = { viewModel.register(onSuccess) },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = uiState.canRegister
                ) {
                    if (uiState.isLoading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            color = Slate50,
                            strokeWidth = 2.dp
                        )
                    } else {
                        Text("Register", style = TextStyle(fontWeight = FontWeight.SemiBold))
                    }
                }

                Spacer(Modifier.height(10.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    HuddleSecondaryButton(
                        onClick = onBack,
                        modifier = Modifier.weight(1f),
                        enabled = !uiState.isLoading
                    ) {
                        Text("Back")
                    }
                    HuddleSecondaryButton(
                        onClick = onGoToLogin,
                        modifier = Modifier.weight(1f),
                        enabled = !uiState.isLoading
                    ) {
                        Text("Log in")
                    }
                }
                
                Spacer(Modifier.height(12.dp))
                
                // Warning text at the bottom
                Text(
                    text = "No password reset yet - store your password safely.",
                    style = TextStyle(color = Slate500, fontSize = 11.sp)
                )
            }
            
            Spacer(Modifier.height(24.dp))
        }
    }
}
