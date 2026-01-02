package tv.wehuddle.app.ui.screens.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
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
import tv.wehuddle.app.ui.theme.Rose500
import tv.wehuddle.app.ui.theme.Slate400
import tv.wehuddle.app.ui.theme.Slate50
import tv.wehuddle.app.ui.theme.Slate500
import tv.wehuddle.app.ui.theme.Slate900
import tv.wehuddle.app.ui.theme.Slate950

@Composable
fun LoginScreen(
    onBack: () -> Unit,
    onGoToRegister: () -> Unit,
    onSuccess: () -> Unit,
    viewModel: AuthViewModel = hiltViewModel()
) {
    val uiState = viewModel.uiState.collectAsStateWithLifecycle().value

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Slate950)
            .padding(horizontal = 24.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding(),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            GlassCard(modifier = Modifier.widthIn(max = 420.dp)) {
                Text(
                    text = "Log in",
                    style = TextStyle(
                        color = Slate50,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "Use your username to access saved rooms.",
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
                    onClick = { viewModel.login(onSuccess) },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = uiState.canLogin
                ) {
                    if (uiState.isLoading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            color = Slate50,
                            strokeWidth = 2.dp
                        )
                    } else {
                        Text("Log in", style = TextStyle(fontWeight = FontWeight.SemiBold))
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
                        onClick = onGoToRegister,
                        modifier = Modifier.weight(1f),
                        enabled = !uiState.isLoading
                    ) {
                        Text("Register")
                    }
                }
                
                Spacer(Modifier.height(12.dp))
                
                // Warning text at the bottom
                Text(
                    text = "No password reset yet - don't forget your password.",
                    style = TextStyle(color = Slate500, fontSize = 11.sp)
                )
            }
        }
    }
}
