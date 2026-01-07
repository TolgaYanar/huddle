package tv.wehuddle.app.util

import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.focus.FocusManager
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type

/**
 * TV Focus utilities for D-pad navigation
 */
object TvFocusUtils {
    
    /**
     * Create a modifier that handles D-pad navigation
     */
    @OptIn(ExperimentalComposeUiApi::class)
    fun Modifier.handleDpadNavigation(
        focusManager: FocusManager,
        onSelect: (() -> Unit)? = null,
        onBack: (() -> Unit)? = null
    ): Modifier = this.onKeyEvent { event ->
        if (event.type == KeyEventType.KeyDown) {
            when (event.key) {
                Key.DirectionUp -> {
                    focusManager.moveFocus(FocusDirection.Up)
                    true
                }
                Key.DirectionDown -> {
                    focusManager.moveFocus(FocusDirection.Down)
                    true
                }
                Key.DirectionLeft -> {
                    focusManager.moveFocus(FocusDirection.Left)
                    true
                }
                Key.DirectionRight -> {
                    focusManager.moveFocus(FocusDirection.Right)
                    true
                }
                Key.Enter, Key.DirectionCenter, Key.NumPadEnter -> {
                    onSelect?.invoke()
                    onSelect != null
                }
                Key.Back, Key.Escape -> {
                    onBack?.invoke()
                    onBack != null
                }
                else -> false
            }
        } else {
            false
        }
    }
}

/**
 * Modifier extension that makes a composable TV-focusable with visual feedback
 */
fun Modifier.tvFocusable(
    interactionSource: MutableInteractionSource,
    focusRequester: FocusRequester? = null,
    onFocusChanged: ((Boolean) -> Unit)? = null
): Modifier = composed {
    val baseModifier = if (focusRequester != null) {
        this.focusRequester(focusRequester)
    } else {
        this
    }
    
    baseModifier
        .onFocusChanged { focusState ->
            onFocusChanged?.invoke(focusState.isFocused)
        }
        .focusable(interactionSource = interactionSource)
}

/**
 * Remember focus state for TV-focusable composables
 */
@Composable
fun rememberTvFocusState(): TvFocusState {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()
    val focusRequester = remember { FocusRequester() }
    
    return remember(isFocused) {
        TvFocusState(
            interactionSource = interactionSource,
            isFocused = isFocused,
            focusRequester = focusRequester
        )
    }
}

data class TvFocusState(
    val interactionSource: MutableInteractionSource,
    val isFocused: Boolean,
    val focusRequester: FocusRequester
)

/**
 * D-pad key event handler for common TV remote controls
 */
@OptIn(ExperimentalComposeUiApi::class)
fun Modifier.onDpadKeyEvent(
    onUp: (() -> Boolean)? = null,
    onDown: (() -> Boolean)? = null,
    onLeft: (() -> Boolean)? = null,
    onRight: (() -> Boolean)? = null,
    onSelect: (() -> Boolean)? = null,
    onBack: (() -> Boolean)? = null,
    onPlayPause: (() -> Boolean)? = null,
    onRewind: (() -> Boolean)? = null,
    onFastForward: (() -> Boolean)? = null
): Modifier = this.onKeyEvent { event ->
    if (event.type == KeyEventType.KeyDown) {
        when (event.key) {
            Key.DirectionUp -> onUp?.invoke() ?: false
            Key.DirectionDown -> onDown?.invoke() ?: false
            Key.DirectionLeft -> onLeft?.invoke() ?: false
            Key.DirectionRight -> onRight?.invoke() ?: false
            Key.Enter, Key.DirectionCenter, Key.NumPadEnter -> onSelect?.invoke() ?: false
            Key.Back, Key.Escape -> onBack?.invoke() ?: false
            Key.MediaPlayPause, Key.Spacebar -> onPlayPause?.invoke() ?: false
            Key.MediaRewind -> onRewind?.invoke() ?: false
            Key.MediaFastForward -> onFastForward?.invoke() ?: false
            else -> false
        }
    } else {
        false
    }
}

/**
 * Focus group for organizing D-pad navigation in sections
 */
object FocusGroup {
    const val HEADER = "header"
    const val MAIN_CONTENT = "main_content"
    const val SIDEBAR = "sidebar"
    const val CONTROLS = "controls"
    const val PLAYER = "player"
}
