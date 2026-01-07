package tv.wehuddle.app

import android.os.Bundle
import android.view.KeyEvent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import dagger.hilt.android.AndroidEntryPoint
import tv.wehuddle.app.navigation.HuddleNavGraph
import tv.wehuddle.app.ui.theme.HuddleTheme
import tv.wehuddle.app.ui.theme.Slate950
import tv.wehuddle.app.util.DeviceUtils

/**
 * CompositionLocal to provide TV state throughout the app
 */
val LocalIsTV = staticCompositionLocalOf { false }

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    
    private var isTV: Boolean = false
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Detect if running on TV
        isTV = DeviceUtils.isTV(this)
        
        // Only enable edge-to-edge on non-TV devices
        // TV devices have different system UI handling
        if (!isTV) {
            enableEdgeToEdge()
        }
        
        setContent {
            CompositionLocalProvider(LocalIsTV provides isTV) {
                HuddleTheme {
                    Surface(
                        modifier = Modifier.fillMaxSize(),
                        color = Slate950
                    ) {
                        HuddleNavGraph()
                    }
                }
            }
        }
    }
    
    /**
     * Handle key events for TV remote control
     * This provides app-level handling for media keys
     */
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (isTV) {
            when (keyCode) {
                // Handle media keys at activity level if needed
                KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
                KeyEvent.KEYCODE_MEDIA_PLAY,
                KeyEvent.KEYCODE_MEDIA_PAUSE -> {
                    // Let Compose handle these through onKeyEvent modifiers
                    return super.onKeyDown(keyCode, event)
                }
                KeyEvent.KEYCODE_BACK -> {
                    // Let the navigation system handle back
                    return super.onKeyDown(keyCode, event)
                }
            }
        }
        return super.onKeyDown(keyCode, event)
    }
}
