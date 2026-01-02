package tv.wehuddle.app.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import android.net.Uri
import tv.wehuddle.app.ui.screens.home.HomeScreen
import tv.wehuddle.app.ui.screens.auth.LoginScreen
import tv.wehuddle.app.ui.screens.auth.RegisterScreen
import tv.wehuddle.app.ui.screens.room.RoomScreen

/**
 * Navigation routes for the app
 */
object Routes {
    const val HOME = "home"
    const val ROOM = "room/{roomId}"

    const val LOGIN = "login?next={next}"
    const val REGISTER = "register?next={next}"
    
    fun room(roomId: String) = "room/$roomId"

    fun login(next: String? = null): String {
        val encoded = next?.let { Uri.encode(it) } ?: ""
        return "login?next=$encoded"
    }

    fun register(next: String? = null): String {
        val encoded = next?.let { Uri.encode(it) } ?: ""
        return "register?next=$encoded"
    }
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
                },
                onNavigateToLogin = { next ->
                    navController.navigate(Routes.login(next))
                },
                onNavigateToRegister = { next ->
                    navController.navigate(Routes.register(next))
                }
            )
        }

        composable(
            route = Routes.LOGIN,
            arguments = listOf(
                navArgument("next") {
                    type = NavType.StringType
                    defaultValue = ""
                }
            )
        ) { entry ->
            val next = entry.arguments?.getString("next")?.takeIf { it.isNotBlank() }
            LoginScreen(
                onBack = { navController.popBackStack() },
                onGoToRegister = {
                    navController.navigate(Routes.register(next))
                },
                onSuccess = {
                    if (next != null) {
                        navController.navigate(next) {
                            popUpTo(Routes.HOME)
                        }
                    } else {
                        navController.popBackStack()
                    }
                }
            )
        }

        composable(
            route = Routes.REGISTER,
            arguments = listOf(
                navArgument("next") {
                    type = NavType.StringType
                    defaultValue = ""
                }
            )
        ) { entry ->
            val next = entry.arguments?.getString("next")?.takeIf { it.isNotBlank() }
            RegisterScreen(
                onBack = { navController.popBackStack() },
                onGoToLogin = {
                    navController.navigate(Routes.login(next))
                },
                onSuccess = {
                    if (next != null) {
                        navController.navigate(next) {
                            popUpTo(Routes.HOME)
                        }
                    } else {
                        navController.popBackStack()
                    }
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
                },
                onNavigateToLogin = {
                    navController.navigate(Routes.login(it))
                },
                onNavigateToRegister = {
                    navController.navigate(Routes.register(it))
                }
            )
        }
    }
}
