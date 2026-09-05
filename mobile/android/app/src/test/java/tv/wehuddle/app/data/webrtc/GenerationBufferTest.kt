package tv.wehuddle.app.data.webrtc

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GenerationBufferTest {
    @Test
    fun `creating the peer preserves candidates that arrived before the offer`() {
        val buffer = GenerationBuffer<String>(maxPerPeer = 3)

        assertTrue(buffer.add("peer", "early", "g1"))
        buffer.ensurePeer("peer")

        assertEquals(listOf("early"), buffer.drain("peer") { it == "g1" })
    }

    @Test
    fun `drain preserves future generations and the buffer stays bounded`() {
        val buffer = GenerationBuffer<String>(maxPerPeer = 2)

        assertTrue(buffer.add("peer", "stale", "g0"))
        assertTrue(buffer.add("peer", "current", "g1"))
        assertFalse(buffer.add("peer", "overflow", "g2"))

        assertEquals(listOf("current"), buffer.drain("peer") { it == "g1" })
        assertEquals(listOf("overflow"), buffer.drain("peer") { it == "g2" })
        assertEquals(emptyList<String>(), buffer.drain("peer") { true })
    }

    @Test
    fun `inactive peer buffers can be discarded together`() {
        val buffer = GenerationBuffer<String>(maxPerPeer = 2)

        buffer.add("active", "keep", null)
        buffer.add("gone", "drop", null)
        buffer.retainPeers(setOf("active"))

        assertEquals(listOf("keep"), buffer.drain("active") { true })
        assertEquals(emptyList<String>(), buffer.drain("gone") { true })
    }
}
