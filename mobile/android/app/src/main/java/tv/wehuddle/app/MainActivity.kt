package tv.wehuddle.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import dagger.hilt.android.AndroidEntryPoint
import tv.wehuddle.app.navigation.HuddleNavGraph
import tv.wehuddle.app.ui.theme.HuddleTheme
import tv.wehuddle.app.ui.theme.Slate950

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        enableEdgeToEdge()
        
        setContent {
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
