package tv.wehuddle.app.data.webrtc

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SpeakingDetectorTest {
    @Test
    fun `detects pcm voice and keeps the highlight through the hangover`() {
        val detector = SpeakingDetector(threshold = 1_000, hangoverMillis = 450)

        assertNull(detector.updatePcm16(pcm16(0), nowMillis = 0))
        assertEquals(true, detector.updatePcm16(pcm16(2_000), nowMillis = 10))
        assertNull(detector.updatePcm16(pcm16(0), nowMillis = 459))
        assertEquals(false, detector.updatePcm16(pcm16(0), nowMillis = 460))
    }

    @Test
    fun `reset broadcasts false only when currently speaking`() {
        val detector = SpeakingDetector(threshold = 1_000)

        assertEquals(true, detector.updatePcm16(pcm16(-2_000), nowMillis = 10))
        assertEquals(false, detector.reset())
        assertNull(detector.reset())
    }

    private fun pcm16(value: Int, samples: Int = 32): ByteArray {
        val bounded = value.toShort().toInt()
        return ByteArray(samples * 2).also { bytes ->
            repeat(samples) { sampleIndex ->
                bytes[sampleIndex * 2] = (bounded and 0xff).toByte()
                bytes[sampleIndex * 2 + 1] = (bounded shr 8).toByte()
            }
        }
    }
}
