package tv.wehuddle.app.data.webrtc

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertSame
import org.junit.Test

class VersionedValueTest {
    private data class MutableStream(
        var hasAudio: Boolean,
        var hasVideo: Boolean,
    )

    @Test
    fun `adding camera to the same JNI stream publishes a distinct state`() {
        val stream = MutableStream(hasAudio = true, hasVideo = false)
        val audioOnly = publishVersionedValue(emptyMap(), "peer", stream)

        stream.hasVideo = true
        val withCamera = publishVersionedValue(audioOnly, "peer", stream)

        assertNotEquals(audioOnly, withCamera)
        assertSame(stream, withCamera.getValue("peer").value)
        assertEquals(2L, withCamera.getValue("peer").revision)
    }

    @Test
    fun `adding audio to the same JNI stream publishes a distinct state`() {
        val stream = MutableStream(hasAudio = false, hasVideo = true)
        val cameraOnly = publishVersionedValue(emptyMap(), "peer", stream)

        stream.hasAudio = true
        val withAudio = publishVersionedValue(cameraOnly, "peer", stream)

        assertNotEquals(cameraOnly, withAudio)
        assertSame(stream, withAudio.getValue("peer").value)
        assertEquals(2L, withAudio.getValue("peer").revision)
    }
}
