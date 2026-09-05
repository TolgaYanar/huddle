package tv.wehuddle.app.ui.components

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import tv.wehuddle.app.data.model.Participant
import tv.wehuddle.app.data.model.WebRTCMediaState

class RoomCallStripStateTest {
    @Test
    fun `local tile stays mounted while camera changes from off to live`() {
        val cameraOff = buildTiles(
            localMediaState = WebRTCMediaState(cam = false),
            localStreamAvailable = true,
        ).single()
        val cameraOn = buildTiles(
            localMediaState = WebRTCMediaState(cam = true),
            localStreamAvailable = true,
        ).single()

        assertEquals("local", cameraOff.stableKey)
        assertEquals(cameraOff.stableKey, cameraOn.stableKey)
        assertEquals(CallVideoPresentation.CAMERA_OFF, cameraOff.videoPresentation)
        assertEquals(CallVideoPresentation.VIDEO, cameraOn.videoPresentation)
        assertTrue(cameraOn.isLocal)
    }

    @Test
    fun `remote camera waits in a stable tile then renders when stream arrives`() {
        val remote = Participant(
            id = "peer-2",
            username = "Ada",
            isSpeaking = true,
            mediaState = WebRTCMediaState(mic = true, cam = true),
        )
        val beforeStream = buildTiles(participants = listOf(remote))[1]
        val afterStream = buildTiles(
            participants = listOf(remote),
            remoteStreamPeerIds = setOf(remote.id),
        )[1]

        assertEquals("remote:peer-2", beforeStream.stableKey)
        assertEquals(beforeStream.stableKey, afterStream.stableKey)
        assertEquals(CallVideoPresentation.WAITING_FOR_STREAM, beforeStream.videoPresentation)
        assertEquals(CallVideoPresentation.VIDEO, afterStream.videoPresentation)
        assertTrue(afterStream.isSpeaking)
        assertFalse(afterStream.isLocal)
    }

    @Test
    fun `remote camera off remains a placeholder even when a stream exists`() {
        val remote = Participant(
            id = "peer-2",
            mediaState = WebRTCMediaState(mic = true, cam = false),
        )

        val tile = buildTiles(
            participants = listOf(remote),
            remoteStreamPeerIds = setOf(remote.id),
        )[1]

        assertEquals(CallVideoPresentation.CAMERA_OFF, tile.videoPresentation)
    }

    @Test
    fun `local participant is not duplicated from the room snapshot`() {
        val tiles = buildTiles(
            participants = listOf(
                Participant(id = "local-user", isLocal = true),
                Participant(id = "peer-2"),
                Participant(id = "peer-2"),
            )
        )

        assertEquals(listOf("local", "remote:peer-2"), tiles.map { it.stableKey })
    }

    @Test
    fun `short landscape uses a compact strip without duplicate controls`() {
        val compact = callStripSizing(isTv = false, isHeightCompact = true)
        val portrait = callStripSizing(isTv = false, isHeightCompact = false)

        assertTrue(compact.tileHeightDp < portrait.tileHeightDp)
        assertFalse(compact.showHeader)
        assertFalse(compact.showLocalControls)
    }

    private fun buildTiles(
        localMediaState: WebRTCMediaState = WebRTCMediaState(),
        localStreamAvailable: Boolean = false,
        participants: List<Participant> = emptyList(),
        remoteStreamPeerIds: Set<String> = emptySet(),
    ) = buildCallStripTileStates(
        localUserId = "local-user",
        localUsername = "You",
        localMediaState = localMediaState,
        localIsSpeaking = false,
        localStreamAvailable = localStreamAvailable,
        participants = participants,
        remoteStreamPeerIds = remoteStreamPeerIds,
    )
}
