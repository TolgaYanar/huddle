package tv.wehuddle.app.data.webrtc

import org.junit.Assert.assertFalse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PeerConnectionPolicyTest {
    @Test
    fun `exactly one side initiates for either socket id ordering`() {
        assertTrue(WebRTCManager.shouldInitiatePeerConnection("android-a", "web-z"))
        assertFalse(WebRTCManager.shouldInitiatePeerConnection("web-z", "android-a"))

        assertFalse(WebRTCManager.shouldInitiatePeerConnection("z-android", "a-web"))
        assertTrue(WebRTCManager.shouldInitiatePeerConnection("a-web", "z-android"))
    }

    @Test
    fun `never initiates for blank or self peer ids`() {
        assertFalse(WebRTCManager.shouldInitiatePeerConnection("", "peer"))
        assertFalse(WebRTCManager.shouldInitiatePeerConnection("peer", ""))
        assertFalse(WebRTCManager.shouldInitiatePeerConnection("peer", "peer"))
    }

    @Test
    fun `exactly the non-initiating side is polite during offer glare`() {
        assertFalse(WebRTCManager.isPolitePeer("a", "z"))
        assertTrue(WebRTCManager.isPolitePeer("z", "a"))
        assertFalse(WebRTCManager.isPolitePeer("peer", "peer"))
    }

    @Test
    fun `signaling generations reject stale non-null values but accept legacy null`() {
        assertTrue(
            WebRTCManager.isSignalingGenerationCompatible(
                hasActiveGeneration = true,
                activeGeneration = "current",
                incomingGeneration = "current",
            )
        )
        assertFalse(
            WebRTCManager.isSignalingGenerationCompatible(
                hasActiveGeneration = true,
                activeGeneration = "current",
                incomingGeneration = "stale",
            )
        )
        assertTrue(
            WebRTCManager.isSignalingGenerationCompatible(
                hasActiveGeneration = true,
                activeGeneration = "current",
                incomingGeneration = null,
            )
        )
        assertTrue(
            WebRTCManager.isSignalingGenerationCompatible(
                hasActiveGeneration = false,
                activeGeneration = null,
                incomingGeneration = "first-offer",
            )
        )
    }

    @Test
    fun `generated signaling token is non-empty and within the wire limit`() {
        val first = WebRTCManager.createSignalingGeneration()
        val second = WebRTCManager.createSignalingGeneration()

        assertTrue(first.length in 1..64)
        assertTrue(second.length in 1..64)
        assertTrue(first != second)
    }

    @Test
    fun `TURN credential refresh is scheduled at eighty percent of ttl`() {
        assertEquals(
            2_880_000L,
            WebRTCManager.iceCredentialRefreshDelayMillis(3_600L),
        )
        assertNull(WebRTCManager.iceCredentialRefreshDelayMillis(null))
        assertNull(WebRTCManager.iceCredentialRefreshDelayMillis(0L))
    }

    @Test
    fun `connected transport only cancels ordinary recovery`() {
        assertTrue(
            WebRTCManager.shouldCancelPeerRecovery(
                peerIsActive = true,
                connectionIsCurrent = true,
                connectionIsConnected = true,
                force = false,
            )
        )
        assertFalse(
            WebRTCManager.shouldCancelPeerRecovery(
                peerIsActive = true,
                connectionIsCurrent = true,
                connectionIsConnected = true,
                force = true,
            )
        )
    }

    @Test
    fun `stale peer always cancels recovery even when forced`() {
        assertTrue(
            WebRTCManager.shouldCancelPeerRecovery(
                peerIsActive = false,
                connectionIsCurrent = true,
                connectionIsConnected = false,
                force = true,
            )
        )
        assertTrue(
            WebRTCManager.shouldCancelPeerRecovery(
                peerIsActive = true,
                connectionIsCurrent = false,
                connectionIsConnected = false,
                force = true,
            )
        )
    }

    @Test
    fun `extracts every ICE username fragment from SDP`() {
        val sdp = """
            v=0
            a=ice-ufrag:first
            m=video 9 UDP/TLS/RTP/SAVPF 96
            a=ice-ufrag:second
        """.trimIndent()

        assertEquals(setOf("first", "second"), WebRTCManager.iceUfragsFromSdp(sdp))
    }

    @Test
    fun `extracts candidate username fragment without guessing`() {
        assertEquals(
            "candidate-ufrag",
            WebRTCManager.iceUfragFromCandidate(
                "candidate:1 1 udp 2122260223 192.0.2.1 54400 typ host generation 0 ufrag candidate-ufrag network-cost 999"
            )
        )
        assertNull(
            WebRTCManager.iceUfragFromCandidate(
                "candidate:1 1 udp 2122260223 192.0.2.1 54400 typ host"
            )
        )
    }
}
