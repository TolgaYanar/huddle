package tv.wehuddle.app.data.model

import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WebRTCMediaStateProtocolTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `outbound media state uses the server state envelope`() {
        val encoded = json.encodeToString(
            WebRTCMediaStateRequest(
                roomId = "room-1",
                state = WebRTCMediaState(mic = true, cam = false, screen = false),
            )
        )

        val objectValue = json.parseToJsonElement(encoded).jsonObject
        assertEquals("room-1", objectValue.getValue("roomId").jsonPrimitive.content)
        assertFalse("mic" in objectValue)
        assertTrue(objectValue.getValue("state").jsonObject.getValue("mic").jsonPrimitive.boolean)
    }

    @Test
    fun `inbound media state reads from and nested state`() {
        val decoded = json.decodeFromString<WebRTCMediaStateEvent>(
            """{"roomId":"room-1","from":"peer-2","state":{"mic":true,"cam":true,"screen":false}}"""
        )

        assertEquals("peer-2", decoded.fromId)
        assertTrue(decoded.state.mic)
        assertTrue(decoded.state.cam)
        assertFalse(decoded.state.screen)
    }

    @Test
    fun `private room snapshot can carry TURN membership proof`() {
        val decoded = json.decodeFromString<RoomUsersData>(
            """{"roomId":"room-1","users":["socket-1"],"iceAccessToken":"private-token"}"""
        )

        assertEquals("private-token", decoded.iceAccessToken)
    }
}
