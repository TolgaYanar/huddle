package tv.wehuddle.app.ui.screens.room

import org.junit.Assert.assertEquals
import org.junit.Test
import androidx.lifecycle.Lifecycle
import tv.wehuddle.app.data.model.ConnectionState

class RoomAccessPolicyTest {
    @Test
    fun `room controls remain hidden until membership is confirmed`() {
        assertEquals(
            RoomAccessSurface.JOINING,
            roomAccessSurface(
                passwordRequired = false,
                connectionState = ConnectionState.CONNECTED,
                userId = "",
                error = null,
            ),
        )
        assertEquals(
            RoomAccessSurface.ROOM,
            roomAccessSurface(
                passwordRequired = false,
                connectionState = ConnectionState.CONNECTED,
                userId = "socket-1",
                error = null,
            ),
        )
    }

    @Test
    fun `password and denied states take the user out of room controls`() {
        assertEquals(
            RoomAccessSurface.PASSWORD,
            roomAccessSurface(
                passwordRequired = true,
                connectionState = ConnectionState.CONNECTED,
                userId = "",
                error = null,
            ),
        )
        assertEquals(
            RoomAccessSurface.DENIED,
            roomAccessSurface(
                passwordRequired = false,
                connectionState = ConnectionState.CONNECTED,
                userId = "",
                error = "You do not have access to this room.",
            ),
        )
    }

    @Test
    fun `an unrelated recoverable error does not cover an authorized room`() {
        assertEquals(
            RoomAccessSurface.ROOM,
            roomAccessSurface(
                passwordRequired = false,
                connectionState = ConnectionState.CONNECTED,
                userId = "socket-1",
                error = "Temporary request failed",
            ),
        )
    }

    @Test
    fun `auth reconnect removes room controls even if the old socket id remains briefly`() {
        assertEquals(
            RoomAccessSurface.JOINING,
            roomAccessSurface(
                passwordRequired = false,
                connectionState = ConnectionState.CONNECTING,
                userId = "old-socket",
                error = null,
            ),
        )
    }

    @Test
    fun `leaving or backgrounding the room suspends capture and returning only resumes playout`() {
        assertEquals(
            RoomCallLifecycleAction.SUSPEND,
            roomCallLifecycleAction(Lifecycle.Event.ON_STOP),
        )
        assertEquals(
            RoomCallLifecycleAction.SUSPEND,
            roomCallLifecycleAction(Lifecycle.Event.ON_DESTROY),
        )
        assertEquals(
            RoomCallLifecycleAction.RESUME,
            roomCallLifecycleAction(Lifecycle.Event.ON_START),
        )
        assertEquals(
            RoomCallLifecycleAction.NONE,
            roomCallLifecycleAction(Lifecycle.Event.ON_RESUME),
        )
    }

    @Test
    fun `tv focus waits for an attached authorized wide layout`() {
        assertEquals(
            false,
            shouldRequestInitialTvFocus(
                isTv = true,
                isWide = true,
                accessSurface = RoomAccessSurface.JOINING,
            ),
        )
        assertEquals(
            false,
            shouldRequestInitialTvFocus(
                isTv = true,
                isWide = false,
                accessSurface = RoomAccessSurface.ROOM,
            ),
        )
        assertEquals(
            true,
            shouldRequestInitialTvFocus(
                isTv = true,
                isWide = true,
                accessSurface = RoomAccessSurface.ROOM,
            ),
        )
    }
}
