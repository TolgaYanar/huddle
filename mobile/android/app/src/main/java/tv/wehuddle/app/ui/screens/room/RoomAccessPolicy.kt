package tv.wehuddle.app.ui.screens.room

import androidx.lifecycle.Lifecycle
import tv.wehuddle.app.data.model.ConnectionState

internal enum class RoomAccessSurface {
    PASSWORD,
    JOINING,
    DENIED,
    ROOM,
}

internal enum class RoomCallLifecycleAction {
    NONE,
    SUSPEND,
    RESUME,
}

internal fun roomCallLifecycleAction(event: Lifecycle.Event): RoomCallLifecycleAction = when (event) {
    Lifecycle.Event.ON_START -> RoomCallLifecycleAction.RESUME
    Lifecycle.Event.ON_STOP,
    Lifecycle.Event.ON_DESTROY -> RoomCallLifecycleAction.SUSPEND
    else -> RoomCallLifecycleAction.NONE
}

internal fun shouldRequestInitialTvFocus(
    isTv: Boolean,
    isWide: Boolean,
    accessSurface: RoomAccessSurface,
): Boolean = isTv && isWide && accessSurface == RoomAccessSurface.ROOM

/**
 * The room UI is an authorization boundary: media controls are rendered only
 * after the server confirms this socket in a private room_users snapshot.
 */
internal fun roomAccessSurface(
    passwordRequired: Boolean,
    connectionState: ConnectionState,
    userId: String,
    error: String?,
): RoomAccessSurface {
    return when {
        passwordRequired -> RoomAccessSurface.PASSWORD
        connectionState != ConnectionState.CONNECTED && !error.isNullOrBlank() ->
            RoomAccessSurface.DENIED
        connectionState != ConnectionState.CONNECTED -> RoomAccessSurface.JOINING
        userId.isNotBlank() -> RoomAccessSurface.ROOM
        !error.isNullOrBlank() -> RoomAccessSurface.DENIED
        else -> RoomAccessSurface.JOINING
    }
}
