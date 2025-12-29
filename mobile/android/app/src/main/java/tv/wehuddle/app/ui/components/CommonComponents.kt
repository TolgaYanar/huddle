package tv.wehuddle.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import tv.wehuddle.app.ui.theme.*

/**
 * Glass morphism card matching the web app style
 */
@Composable
fun GlassCard(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = White5
        ),
        border = CardDefaults.outlinedCardBorder().copy(
            brush = SolidColor(White10)
        )
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            content = content
        )
    }
}

/**
 * Primary button matching web app style
 */
@Composable
fun HuddlePrimaryButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    content: @Composable RowScope.() -> Unit
) {
    Button(
        onClick = onClick,
        modifier = modifier.height(44.dp),
        enabled = enabled,
        shape = RoundedCornerShape(12.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = Slate50,
            contentColor = Slate950,
            disabledContainerColor = Slate50.copy(alpha = 0.5f),
            disabledContentColor = Slate950.copy(alpha = 0.5f)
        ),
        contentPadding = PaddingValues(horizontal = 16.dp)
    ) {
        content()
    }
}

/**
 * Secondary/outline button matching web app style
 */
@Composable
fun HuddleSecondaryButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    content: @Composable RowScope.() -> Unit
) {
    OutlinedButton(
        onClick = onClick,
        modifier = modifier.height(44.dp),
        enabled = enabled,
        shape = RoundedCornerShape(12.dp),
        colors = ButtonDefaults.outlinedButtonColors(
            contentColor = Slate50,
            disabledContentColor = Slate50.copy(alpha = 0.5f)
        ),
        border = ButtonDefaults.outlinedButtonBorder(enabled).copy(
            brush = SolidColor(White10)
        ),
        contentPadding = PaddingValues(horizontal = 16.dp)
    ) {
        content()
    }
}

/**
 * Small button for controls
 */
@Composable
fun HuddleSmallButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    isActive: Boolean = false,
    content: @Composable RowScope.() -> Unit
) {
    Button(
        onClick = onClick,
        modifier = modifier.height(32.dp),
        enabled = enabled,
        shape = RoundedCornerShape(8.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = if (isActive) Emerald500.copy(alpha = 0.15f) else White5,
            contentColor = if (isActive) Emerald200 else Slate200,
            disabledContainerColor = White5.copy(alpha = 0.5f),
            disabledContentColor = Slate400
        ),
        contentPadding = PaddingValues(horizontal = 12.dp)
    ) {
        content()
    }
}

/**
 * Icon button with optional active state
 */
@Composable
fun HuddleIconButton(
    onClick: () -> Unit,
    icon: ImageVector,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    isActive: Boolean = false,
    size: Dp = 40.dp,
    iconSize: Dp = 24.dp
) {
    Box(
        modifier = modifier
            .size(size)
            .clip(RoundedCornerShape(8.dp))
            .background(if (isActive) Emerald500.copy(alpha = 0.15f) else White5)
            .border(1.dp, White10, RoundedCornerShape(8.dp))
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            modifier = Modifier.size(iconSize),
            tint = if (isActive) Emerald200 else Slate200
        )
    }
}

/**
 * Text input field matching web app style
 */
@Composable
fun HuddleTextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    enabled: Boolean = true,
    singleLine: Boolean = true,
    leadingIcon: @Composable (() -> Unit)? = null,
    trailingIcon: @Composable (() -> Unit)? = null
) {
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier
            .height(44.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(Black20)
            .border(1.dp, White10, RoundedCornerShape(12.dp)),
        enabled = enabled,
        singleLine = singleLine,
        textStyle = TextStyle(
            color = Slate200,
            fontSize = 14.sp
        ),
        cursorBrush = SolidColor(Indigo500),
        decorationBox = { innerTextField ->
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                leadingIcon?.invoke()
                if (leadingIcon != null) Spacer(Modifier.width(8.dp))
                
                Box(modifier = Modifier.weight(1f)) {
                    if (value.isEmpty()) {
                        Text(
                            text = placeholder,
                            style = TextStyle(
                                color = Slate500,
                                fontSize = 14.sp
                            )
                        )
                    }
                    innerTextField()
                }
                
                if (trailingIcon != null) Spacer(Modifier.width(8.dp))
                trailingIcon?.invoke()
            }
        }
    )
}

/**
 * Password input field
 */
@Composable
fun HuddlePasswordField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "Password",
    enabled: Boolean = true
) {
    var passwordVisible = remember { false }
    
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier
            .height(44.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(Black20)
            .border(1.dp, White10, RoundedCornerShape(12.dp)),
        enabled = enabled,
        singleLine = true,
        textStyle = TextStyle(
            color = Slate200,
            fontSize = 14.sp
        ),
        cursorBrush = SolidColor(Indigo500),
        visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation(),
        decorationBox = { innerTextField ->
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(modifier = Modifier.weight(1f)) {
                    if (value.isEmpty()) {
                        Text(
                            text = placeholder,
                            style = TextStyle(
                                color = Slate500,
                                fontSize = 14.sp
                            )
                        )
                    }
                    innerTextField()
                }
            }
        }
    )
}

/**
 * Connection status indicator
 */
@Composable
fun ConnectionIndicator(
    isConnected: Boolean,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(20.dp))
            .background(Black20)
            .border(1.dp, White10, RoundedCornerShape(20.dp))
            .padding(horizontal = 12.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(10.dp)
                .clip(CircleShape)
                .background(if (isConnected) Emerald500 else Rose500)
        )
        Text(
            text = if (isConnected) "Connected" else "Reconnecting…",
            style = TextStyle(
                color = Slate200,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium
            )
        )
    }
}

/**
 * Speaking indicator badge
 */
@Composable
fun SpeakingBadge(
    isSpeaking: Boolean,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(20.dp))
            .background(
                if (isSpeaking) Emerald500.copy(alpha = 0.15f) 
                else Black20
            )
            .border(1.dp, White10, RoundedCornerShape(20.dp))
            .padding(horizontal = 8.dp, vertical = 4.dp)
    ) {
        Text(
            text = if (isSpeaking) "Speaking" else "Silent",
            style = TextStyle(
                color = if (isSpeaking) Emerald200 else Slate300,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium
            )
        )
    }
}

/**
 * Password status badge
 */
@Composable
fun PasswordBadge(
    hasPassword: Boolean,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(20.dp))
            .background(Black20)
            .border(1.dp, White10, RoundedCornerShape(20.dp))
            .padding(horizontal = 12.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = "Password",
            style = TextStyle(
                color = Slate300,
                fontSize = 12.sp
            )
        )
        Text(
            text = if (hasPassword) "On" else "Off",
            style = TextStyle(
                color = if (hasPassword) Amber200 else Slate200,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium
            )
        )
    }
}

/**
 * Section header
 */
@Composable
fun SectionHeader(
    title: String,
    subtitle: String? = null,
    modifier: Modifier = Modifier,
    trailing: @Composable (() -> Unit)? = null
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = TextStyle(
                    color = Slate50,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold
                )
            )
            if (subtitle != null) {
                Spacer(Modifier.height(4.dp))
                Text(
                    text = subtitle,
                    style = TextStyle(
                        color = Slate400,
                        fontSize = 12.sp
                    )
                )
            }
        }
        trailing?.invoke()
    }
}
