package tv.wehuddle.app.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import tv.wehuddle.app.ui.theme.*
import tv.wehuddle.app.util.isTV
import tv.wehuddle.app.util.rememberUiScaleFactor

/**
 * TV-aware primary button with focus handling for D-pad navigation
 */
@Composable
fun TvPrimaryButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    focusRequester: FocusRequester? = null,
    content: @Composable RowScope.() -> Unit
) {
    val isTV = isTV()
    val scaleFactor = rememberUiScaleFactor()
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()
    val isPressed by interactionSource.collectIsPressedAsState()
    
    val buttonHeight = if (isTV) 56.dp else 44.dp
    val horizontalPadding = if (isTV) 24.dp else 16.dp
    val fontSize = if (isTV) 18.sp else 14.sp
    
    val backgroundColor by animateColorAsState(
        targetValue = when {
            !enabled -> Slate50.copy(alpha = 0.5f)
            isPressed -> Slate200
            isFocused && isTV -> Slate100
            else -> Slate50
        },
        animationSpec = tween(150),
        label = "backgroundColor"
    )
    
    val borderWidth by animateDpAsState(
        targetValue = if (isFocused && isTV) 3.dp else 0.dp,
        animationSpec = tween(150),
        label = "borderWidth"
    )
    
    val elevation by animateDpAsState(
        targetValue = if (isFocused && isTV) 8.dp else 0.dp,
        animationSpec = tween(150),
        label = "elevation"
    )
    
    val baseModifier = if (focusRequester != null) {
        modifier.focusRequester(focusRequester)
    } else {
        modifier
    }
    
    Button(
        onClick = onClick,
        modifier = baseModifier
            .height(buttonHeight)
            .then(
                if (isTV && isFocused) {
                    Modifier
                        .shadow(elevation, RoundedCornerShape(12.dp))
                        .border(borderWidth, TvFocusBorder, RoundedCornerShape(12.dp))
                } else {
                    Modifier
                }
            ),
        enabled = enabled,
        shape = RoundedCornerShape(12.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = backgroundColor,
            contentColor = Slate950,
            disabledContainerColor = Slate50.copy(alpha = 0.5f),
            disabledContentColor = Slate950.copy(alpha = 0.5f)
        ),
        contentPadding = PaddingValues(horizontal = horizontalPadding),
        interactionSource = interactionSource
    ) {
        content()
    }
}

/**
 * TV-aware secondary button with focus handling
 */
@Composable
fun TvSecondaryButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    focusRequester: FocusRequester? = null,
    content: @Composable RowScope.() -> Unit
) {
    val isTV = isTV()
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()
    val isPressed by interactionSource.collectIsPressedAsState()
    
    val buttonHeight = if (isTV) 56.dp else 44.dp
    val horizontalPadding = if (isTV) 24.dp else 16.dp
    
    val borderColor by animateColorAsState(
        targetValue = when {
            isFocused && isTV -> TvFocusBorder
            isPressed -> White20
            else -> White10
        },
        animationSpec = tween(150),
        label = "borderColor"
    )
    
    val borderWidth by animateDpAsState(
        targetValue = if (isFocused && isTV) 3.dp else 1.dp,
        animationSpec = tween(150),
        label = "borderWidth"
    )
    
    val containerColor by animateColorAsState(
        targetValue = when {
            isFocused && isTV -> TvHoverBackground
            isPressed -> White5
            else -> Color.Transparent
        },
        animationSpec = tween(150),
        label = "containerColor"
    )
    
    val baseModifier = if (focusRequester != null) {
        modifier.focusRequester(focusRequester)
    } else {
        modifier
    }
    
    OutlinedButton(
        onClick = onClick,
        modifier = baseModifier.height(buttonHeight),
        enabled = enabled,
        shape = RoundedCornerShape(12.dp),
        colors = ButtonDefaults.outlinedButtonColors(
            containerColor = containerColor,
            contentColor = Slate50,
            disabledContentColor = Slate50.copy(alpha = 0.5f)
        ),
        border = BorderStroke(borderWidth, borderColor),
        contentPadding = PaddingValues(horizontal = horizontalPadding),
        interactionSource = interactionSource
    ) {
        content()
    }
}

/**
 * TV-aware card component with focus state
 */
@Composable
fun TvCard(
    onClick: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
    focusRequester: FocusRequester? = null,
    content: @Composable ColumnScope.() -> Unit
) {
    val isTV = isTV()
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()
    
    val borderColor by animateColorAsState(
        targetValue = if (isFocused && isTV) TvFocusBorder else White10,
        animationSpec = tween(150),
        label = "borderColor"
    )
    
    val borderWidth by animateDpAsState(
        targetValue = if (isFocused && isTV) 3.dp else 1.dp,
        animationSpec = tween(150),
        label = "borderWidth"
    )
    
    val elevation by animateDpAsState(
        targetValue = if (isFocused && isTV) 12.dp else 0.dp,
        animationSpec = tween(150),
        label = "elevation"
    )
    
    val scale by animateDpAsState(
        targetValue = if (isFocused && isTV) 4.dp else 0.dp,
        animationSpec = tween(150),
        label = "scale"
    )
    
    val baseModifier = if (focusRequester != null) {
        modifier.focusRequester(focusRequester)
    } else {
        modifier
    }
    
    Card(
        modifier = baseModifier
            .then(
                if (onClick != null) {
                    Modifier
                        .focusable(interactionSource = interactionSource)
                        .clickable(
                            interactionSource = interactionSource,
                            indication = null,
                            onClick = onClick
                        )
                } else {
                    Modifier
                }
            )
            .then(
                if (isFocused && isTV) {
                    Modifier
                        .padding(scale) // Creates visual "pop" effect
                        .shadow(elevation, RoundedCornerShape(16.dp))
                } else {
                    Modifier
                }
            ),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (isFocused && isTV) TvHoverBackground else White5
        ),
        border = CardDefaults.outlinedCardBorder().copy(
            width = borderWidth,
            brush = SolidColor(borderColor)
        )
    ) {
        Column(
            modifier = Modifier.padding(if (isTV) 24.dp else 16.dp),
            content = content
        )
    }
}

/**
 * TV-aware text field with large touch/focus area
 */
@Composable
fun TvTextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    enabled: Boolean = true,
    singleLine: Boolean = true,
    focusRequester: FocusRequester? = null
) {
    val isTV = isTV()
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()
    
    val fieldHeight = if (isTV) 56.dp else 44.dp
    val fontSize = if (isTV) 18.sp else 14.sp
    val horizontalPadding = if (isTV) 20.dp else 16.dp
    
    val borderColor by animateColorAsState(
        targetValue = when {
            isFocused -> if (isTV) TvFocusBorder else Indigo500
            else -> White10
        },
        animationSpec = tween(150),
        label = "borderColor"
    )
    
    val borderWidth by animateDpAsState(
        targetValue = if (isFocused && isTV) 3.dp else 1.dp,
        animationSpec = tween(150),
        label = "borderWidth"
    )
    
    val baseModifier = if (focusRequester != null) {
        modifier.focusRequester(focusRequester)
    } else {
        modifier
    }
    
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = baseModifier
            .height(fieldHeight)
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(if (isFocused && isTV) TvHoverBackground else Black20)
            .border(borderWidth, borderColor, RoundedCornerShape(12.dp)),
        enabled = enabled,
        singleLine = singleLine,
        textStyle = TextStyle(
            color = Slate200,
            fontSize = fontSize
        ),
        cursorBrush = SolidColor(Indigo500),
        interactionSource = interactionSource,
        decorationBox = { innerTextField ->
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = horizontalPadding),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(modifier = Modifier.weight(1f)) {
                    if (value.isEmpty()) {
                        Text(
                            text = placeholder,
                            style = TextStyle(
                                color = Slate500,
                                fontSize = fontSize
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
 * TV-aware icon button with focus handling
 */
@Composable
fun TvIconButton(
    onClick: () -> Unit,
    icon: ImageVector,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    isActive: Boolean = false,
    size: Dp = 48.dp,
    iconSize: Dp = 24.dp,
    focusRequester: FocusRequester? = null
) {
    val isTV = isTV()
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()
    
    val actualSize = if (isTV) size * 1.25f else size
    val actualIconSize = if (isTV) iconSize * 1.25f else iconSize
    
    val backgroundColor by animateColorAsState(
        targetValue = when {
            isFocused && isTV -> TvHoverBackground
            isActive -> Emerald500.copy(alpha = 0.15f)
            else -> White5
        },
        animationSpec = tween(150),
        label = "backgroundColor"
    )
    
    val borderColor by animateColorAsState(
        targetValue = when {
            isFocused && isTV -> TvFocusBorder
            isActive -> Emerald500
            else -> White10
        },
        animationSpec = tween(150),
        label = "borderColor"
    )
    
    val borderWidth by animateDpAsState(
        targetValue = if (isFocused && isTV) 3.dp else 1.dp,
        animationSpec = tween(150),
        label = "borderWidth"
    )
    
    val iconTint = when {
        isFocused && isTV -> Slate50
        isActive -> Emerald200
        else -> Slate200
    }
    
    val baseModifier = if (focusRequester != null) {
        modifier.focusRequester(focusRequester)
    } else {
        modifier
    }
    
    Box(
        modifier = baseModifier
            .size(actualSize)
            .clip(RoundedCornerShape(8.dp))
            .background(backgroundColor)
            .border(borderWidth, borderColor, RoundedCornerShape(8.dp))
            .focusable(interactionSource = interactionSource)
            .clickable(
                enabled = enabled,
                interactionSource = interactionSource,
                indication = null,
                onClick = onClick
            ),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            modifier = Modifier.size(actualIconSize),
            tint = iconTint
        )
    }
}

/**
 * TV-aware list item for navigation
 */
@Composable
fun TvListItem(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    leadingContent: @Composable (() -> Unit)? = null,
    trailingContent: @Composable (() -> Unit)? = null,
    focusRequester: FocusRequester? = null,
    content: @Composable () -> Unit
) {
    val isTV = isTV()
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()
    
    val backgroundColor by animateColorAsState(
        targetValue = if (isFocused && isTV) TvHoverBackground else Color.Transparent,
        animationSpec = tween(150),
        label = "backgroundColor"
    )
    
    val borderColor by animateColorAsState(
        targetValue = if (isFocused && isTV) TvFocusBorder else Color.Transparent,
        animationSpec = tween(150),
        label = "borderColor"
    )
    
    val verticalPadding = if (isTV) 16.dp else 12.dp
    val horizontalPadding = if (isTV) 20.dp else 16.dp
    
    val baseModifier = if (focusRequester != null) {
        modifier.focusRequester(focusRequester)
    } else {
        modifier
    }
    
    Row(
        modifier = baseModifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(backgroundColor)
            .border(
                width = if (isFocused && isTV) 2.dp else 0.dp,
                color = borderColor,
                shape = RoundedCornerShape(12.dp)
            )
            .focusable(interactionSource = interactionSource)
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                onClick = onClick
            )
            .padding(horizontal = horizontalPadding, vertical = verticalPadding),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        leadingContent?.invoke()
        Box(modifier = Modifier.weight(1f)) {
            content()
        }
        trailingContent?.invoke()
    }
}

/**
 * Focus-aware tab for TV navigation
 */
@Composable
fun TvTab(
    selected: Boolean,
    onClick: () -> Unit,
    text: String,
    modifier: Modifier = Modifier,
    focusRequester: FocusRequester? = null
) {
    val isTV = isTV()
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()
    
    val backgroundColor by animateColorAsState(
        targetValue = when {
            selected -> Blue500
            isFocused && isTV -> TvHoverBackground
            else -> Color.Transparent
        },
        animationSpec = tween(150),
        label = "backgroundColor"
    )
    
    val borderColor by animateColorAsState(
        targetValue = if (isFocused && isTV && !selected) TvFocusBorder else Color.Transparent,
        animationSpec = tween(150),
        label = "borderColor"
    )
    
    val textColor = when {
        selected -> Slate50
        isFocused && isTV -> Slate50
        else -> Slate400
    }
    
    val fontSize = if (isTV) 16.sp else 14.sp
    val verticalPadding = if (isTV) 14.dp else 10.dp
    val horizontalPadding = if (isTV) 24.dp else 16.dp
    
    val baseModifier = if (focusRequester != null) {
        modifier.focusRequester(focusRequester)
    } else {
        modifier
    }
    
    Box(
        modifier = baseModifier
            .clip(RoundedCornerShape(8.dp))
            .background(backgroundColor)
            .border(
                width = if (isFocused && isTV && !selected) 2.dp else 0.dp,
                color = borderColor,
                shape = RoundedCornerShape(8.dp)
            )
            .focusable(interactionSource = interactionSource)
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                onClick = onClick
            )
            .padding(horizontal = horizontalPadding, vertical = verticalPadding),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            style = TextStyle(
                color = textColor,
                fontSize = fontSize,
                fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium
            )
        )
    }
}
