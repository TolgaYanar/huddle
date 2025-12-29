package tv.wehuddle.app.ui.screens.room.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import tv.wehuddle.app.ui.components.*
import tv.wehuddle.app.ui.theme.*

@Composable
fun PasswordModal(
    passwordInput: String,
    onPasswordChange: (String) -> Unit,
    onSubmit: () -> Unit,
    error: String?
) {
    Dialog(
        onDismissRequest = { /* Cannot dismiss password modal */ },
        properties = DialogProperties(
            dismissOnBackPress = false,
            dismissOnClickOutside = false
        )
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Black50),
            contentAlignment = Alignment.Center
        ) {
            GlassCard(
                modifier = Modifier
                    .widthIn(max = 360.dp)
                    .padding(24.dp)
            ) {
                // Icon
                Box(
                    modifier = Modifier
                        .size(64.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(Amber200.copy(alpha = 0.1f))
                        .border(1.dp, Amber200.copy(alpha = 0.3f), RoundedCornerShape(16.dp))
                        .align(Alignment.CenterHorizontally),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Lock,
                        contentDescription = null,
                        tint = Amber200,
                        modifier = Modifier.size(32.dp)
                    )
                }
                
                Spacer(Modifier.height(20.dp))
                
                // Title
                Text(
                    text = "Enter room password",
                    style = TextStyle(
                        color = Slate50,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.SemiBold
                    ),
                    modifier = Modifier.fillMaxWidth(),
                    textAlign = TextAlign.Center
                )
                
                Spacer(Modifier.height(8.dp))
                
                // Description
                Text(
                    text = "This room requires a password to join.",
                    style = TextStyle(
                        color = Slate400,
                        fontSize = 14.sp
                    ),
                    modifier = Modifier.fillMaxWidth(),
                    textAlign = TextAlign.Center
                )
                
                Spacer(Modifier.height(24.dp))
                
                // Password input
                HuddlePasswordField(
                    value = passwordInput,
                    onValueChange = onPasswordChange,
                    placeholder = "Password",
                    modifier = Modifier.fillMaxWidth()
                )
                
                // Error message
                if (error != null) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = error,
                        style = TextStyle(
                            color = Rose500,
                            fontSize = 12.sp
                        ),
                        modifier = Modifier.fillMaxWidth(),
                        textAlign = TextAlign.Center
                    )
                }
                
                Spacer(Modifier.height(20.dp))
                
                // Submit button
                HuddlePrimaryButton(
                    onClick = onSubmit,
                    enabled = passwordInput.isNotBlank(),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "Submit",
                        style = TextStyle(fontWeight = FontWeight.SemiBold)
                    )
                }
            }
        }
    }
}
