package tv.wehuddle.app.util

import android.app.UiModeManager
import android.content.Context
import android.content.pm.PackageManager
import android.content.res.Configuration
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Utility object for detecting device type (TV vs Mobile/Tablet)
 */
object DeviceUtils {
    
    /**
     * Check if the current device is a TV
     */
    fun isTV(context: Context): Boolean {
        val uiModeManager = context.getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
        if (uiModeManager?.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION) {
            return true
        }
        
        // Also check for Leanback feature (Android TV specific)
        return context.packageManager.hasSystemFeature(PackageManager.FEATURE_LEANBACK)
    }
    
    /**
     * Check if the device has a touchscreen
     */
    fun hasTouchscreen(context: Context): Boolean {
        return context.packageManager.hasSystemFeature(PackageManager.FEATURE_TOUCHSCREEN)
    }
    
    /**
     * Get the device category for layout decisions
     */
    fun getDeviceCategory(context: Context): DeviceCategory {
        return when {
            isTV(context) -> DeviceCategory.TV
            isTablet(context) -> DeviceCategory.TABLET
            else -> DeviceCategory.PHONE
        }
    }
    
    /**
     * Check if device is a tablet (large screen phone-like device)
     */
    fun isTablet(context: Context): Boolean {
        val configuration = context.resources.configuration
        val screenLayout = configuration.screenLayout and Configuration.SCREENLAYOUT_SIZE_MASK
        return screenLayout >= Configuration.SCREENLAYOUT_SIZE_LARGE
    }
    
    /**
     * Get scale factor for UI elements based on device type
     * TV screens are viewed from farther away, so elements should be larger
     */
    fun getUiScaleFactor(context: Context): Float {
        return when (getDeviceCategory(context)) {
            DeviceCategory.TV -> 1.5f
            DeviceCategory.TABLET -> 1.2f
            DeviceCategory.PHONE -> 1.0f
        }
    }
}

enum class DeviceCategory {
    PHONE,
    TABLET,
    TV
}

/**
 * Composable function to check if running on TV
 */
@Composable
fun isTV(): Boolean {
    val context = LocalContext.current
    return remember { DeviceUtils.isTV(context) }
}

/**
 * Get current device category as composable
 */
@Composable
fun rememberDeviceCategory(): DeviceCategory {
    val context = LocalContext.current
    return remember { DeviceUtils.getDeviceCategory(context) }
}

/**
 * Get UI scale factor as composable
 */
@Composable
fun rememberUiScaleFactor(): Float {
    val context = LocalContext.current
    return remember { DeviceUtils.getUiScaleFactor(context) }
}

/**
 * Adaptive dimension that scales based on device type
 */
@Composable
fun Dp.adaptive(): Dp {
    val scaleFactor = rememberUiScaleFactor()
    return this * scaleFactor
}

/**
 * Provides adaptive spacing values for different device types
 */
object AdaptiveSpacing {
    @Composable
    fun small(): Dp = 4.dp.adaptive()
    
    @Composable
    fun medium(): Dp = 8.dp.adaptive()
    
    @Composable
    fun large(): Dp = 16.dp.adaptive()
    
    @Composable
    fun extraLarge(): Dp = 24.dp.adaptive()
}

/**
 * Screen size utility for responsive layouts
 */
@Composable
fun rememberScreenSize(): ScreenSize {
    val configuration = LocalConfiguration.current
    return remember(configuration.screenWidthDp, configuration.screenHeightDp) {
        ScreenSize(
            widthDp = configuration.screenWidthDp.dp,
            heightDp = configuration.screenHeightDp.dp
        )
    }
}

data class ScreenSize(
    val widthDp: Dp,
    val heightDp: Dp
) {
    val isWide: Boolean get() = widthDp > 840.dp
    val isMedium: Boolean get() = widthDp in 600.dp..840.dp
    val isCompact: Boolean get() = widthDp < 600.dp
}
