package tv.wehuddle.app.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

// Huddle always uses dark theme to match the web app
private val HuddleColorScheme = darkColorScheme(
    // Primary colors
    primary = Slate50,
    onPrimary = Slate950,
    primaryContainer = Slate800,
    onPrimaryContainer = Slate100,
    
    // Secondary colors
    secondary = Indigo500,
    onSecondary = Slate50,
    secondaryContainer = Indigo600,
    onSecondaryContainer = Slate100,
    
    // Tertiary colors
    tertiary = Emerald500,
    onTertiary = Slate950,
    tertiaryContainer = Emerald500.copy(alpha = 0.2f),
    onTertiaryContainer = Emerald200,
    
    // Background and surface
    background = Slate950,
    onBackground = Slate50,
    surface = Slate900,
    onSurface = Slate200,
    surfaceVariant = Slate800,
    onSurfaceVariant = Slate300,
    
    // Inverse colors
    inverseSurface = Slate100,
    inverseOnSurface = Slate900,
    inversePrimary = Slate700,
    
    // Error colors
    error = Rose500,
    onError = Slate50,
    errorContainer = Rose500.copy(alpha = 0.2f),
    onErrorContainer = Rose500,
    
    // Outline
    outline = White10,
    outlineVariant = White5,
    
    // Surface tint and scrim
    surfaceTint = Indigo500,
    scrim = Black50
)

@Composable
fun HuddleTheme(
    content: @Composable () -> Unit
) {
    val colorScheme = HuddleColorScheme
    val view = LocalView.current
    
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = Color.Transparent.toArgb()
            window.navigationBarColor = Slate950.toArgb()
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = false
                isAppearanceLightNavigationBars = false
            }
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}
