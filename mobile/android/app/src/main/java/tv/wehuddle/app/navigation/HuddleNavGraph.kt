package tv.wehuddle.app.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import tv.wehuddle.app.ui.screens.home.HomeScreen
import tv.wehuddle.app.ui.screens.room.RoomScreen

/**
 * Navigation routes for the app
 */
object Routes {
    const val HOME = "home"
    const val ROOM = "room/{roomId}"
    
    fun room(roomId: String) = "room/$roomId"
}

/**
 * Main navigation graph
 */
@Composable
fun HuddleNavGraph(
    navController: NavHostController = rememberNavController(),
    startDestination: String = Routes.HOME
) {
    NavHost(
        navController = navController,
        startDestination = startDestination
    ) {
        // Home screen
        composable(route = Routes.HOME) {
            HomeScreen(
                onNavigateToRoom = { roomId ->
                    navController.navigate(Routes.room(roomId))
                }
            )
        }
        
        // Room screen
        composable(
            route = Routes.ROOM,
            arguments = listOf(
                navArgument("roomId") {
                    type = NavType.StringType
                }
            ),
            deepLinks = listOf(
                navDeepLink {
                    uriPattern = "https://wehuddle.tv/r/{roomId}"
                },
                navDeepLink {
                    uriPattern = "huddle://room/{roomId}"
                }
            )
        ) { backStackEntry ->
            val roomId = backStackEntry.arguments?.getString("roomId") ?: ""
            RoomScreen(
                roomId = roomId,
                onNavigateBack = {
                    navController.popBackStack()
                }
            )
        }
    }
}
