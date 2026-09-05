package tv.wehuddle.app.data.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ActiveRoomSessionTest {
    @Test
    fun `protected room credentials remain available for reconnect`() {
        val session = ActiveRoomSession()

        session.remember("protected-room", "correct horse battery staple")

        assertEquals(
            RoomJoinRequest("protected-room", "correct horse battery staple"),
            session.reconnectRequest(),
        )
    }

    @Test
    fun `switching rooms replaces the previous password`() {
        val session = ActiveRoomSession()
        session.remember("protected-room", "secret")

        session.remember("public-room", null)

        assertEquals(RoomJoinRequest("public-room", null), session.reconnectRequest())
    }

    @Test
    fun `only leaving the active room clears reconnect credentials`() {
        val session = ActiveRoomSession()
        session.remember("new-room", "secret")

        session.leave("old-room")
        assertEquals(RoomJoinRequest("new-room", "secret"), session.reconnectRequest())

        session.leave("new-room")
        assertNull(session.reconnectRequest())
    }

    @Test
    fun `manual disconnect clears reconnect credentials`() {
        val session = ActiveRoomSession()
        session.remember("protected-room", "secret")

        session.clear()

        assertNull(session.reconnectRequest())
    }
}
