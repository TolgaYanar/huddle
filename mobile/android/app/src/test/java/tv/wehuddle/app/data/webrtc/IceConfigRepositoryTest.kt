package tv.wehuddle.app.data.webrtc

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import tv.wehuddle.app.data.network.IceConfigResponse
import tv.wehuddle.app.data.network.IceServerDto

class IceConfigRepositoryTest {
    @Test
    fun `validates relay credentials and refreshes before ttl expires`() = runBlocking {
        var now = 1_000L
        var calls = 0
        val repository = IceConfigRepository(
            fetchConfig = { _ ->
                calls += 1
                IceConfigResponse(
                    iceServers = listOf(
                        IceServerDto(listOf("stun:stun.example.test:3478")),
                        IceServerDto(
                            urls = listOf("turn:turn.example.test:3478?transport=udp"),
                            username = "temporary-user",
                            credential = "temporary-password",
                        ),
                    ),
                    ttlSeconds = 100,
                )
            },
            clockMillis = { now },
            requestTimeoutMillis = 1_000,
        )

        val first = repository.getIceConfig()
        now += 79_999
        val cached = repository.getIceConfig()
        now += 1
        val refreshed = repository.getIceConfig()

        assertFalse(first.isFallback)
        assertEquals("temporary-user", first.servers[1].username)
        assertEquals(first, cached)
        assertEquals(first, refreshed)
        assertEquals(2, calls)
    }

    @Test
    fun `rejects unsupported schemes and turn servers without credentials`() = runBlocking {
        val repository = IceConfigRepository(
            fetchConfig = { _ ->
                IceConfigResponse(
                    iceServers = listOf(
                        IceServerDto(listOf("https://not-an-ice-server.test")),
                        IceServerDto(listOf("stun:")),
                        IceServerDto(listOf("turn:turn.example.test:3478")),
                    ),
                    ttlSeconds = 600,
                )
            },
            clockMillis = { 0L },
            requestTimeoutMillis = 1_000,
        )

        val result = repository.getIceConfig()

        assertTrue(result.isFallback)
        assertEquals(IceConfigRepository.FALLBACK_SERVERS, result.servers)
    }

    @Test
    fun `briefly caches network failure then retries`() = runBlocking {
        var now = 0L
        var calls = 0
        val repository = IceConfigRepository(
            fetchConfig = { _ ->
                calls += 1
                if (calls == 1) error("offline")
                IceConfigResponse(
                    iceServers = listOf(IceServerDto(listOf("stun:recovered.test:3478"))),
                    ttlSeconds = null,
                )
            },
            clockMillis = { now },
            requestTimeoutMillis = 1_000,
        )

        assertTrue(repository.getIceConfig().isFallback)
        now = 59_999
        assertTrue(repository.getIceConfig().isFallback)
        assertEquals(1, calls)

        now = 60_000
        val recovered = repository.getIceConfig()
        assertFalse(recovered.isFallback)
        assertEquals("stun:recovered.test:3478", recovered.servers.single().urls.single())
        assertEquals(2, calls)
    }

    @Test
    fun `caller cancellation is not converted into a fallback result`() = runBlocking {
        val fetchStarted = CompletableDeferred<Unit>()
        val repository = IceConfigRepository(
            fetchConfig = { _ ->
                fetchStarted.complete(Unit)
                awaitCancellation()
            },
            clockMillis = { 0L },
            requestTimeoutMillis = 60_000,
        )

        val request = launch { repository.getIceConfig() }
        fetchStarted.await()
        request.cancelAndJoin()

        assertTrue(request.isCancelled)
    }

    @Test
    fun `cache is isolated by room socket and private membership token`() = runBlocking {
        var calls = 0
        val seenAccess = mutableListOf<IceAccessContext?>()
        val repository = IceConfigRepository(
            fetchConfig = { access ->
                calls += 1
                seenAccess += access
                IceConfigResponse(
                    iceServers = listOf(
                        IceServerDto(
                            urls = listOf("turn:turn.example.test:3478"),
                            username = "user-$calls",
                            credential = "credential-$calls",
                        )
                    ),
                    ttlSeconds = 3_600,
                )
            },
            clockMillis = { 0L },
            requestTimeoutMillis = 1_000,
        )
        val first = IceAccessContext("room-a", "socket-a", "token-a")
        val rotated = IceAccessContext("room-a", "socket-b", "token-b")

        assertEquals("user-1", repository.getIceConfig(first).servers.single().username)
        assertEquals("user-1", repository.getIceConfig(first).servers.single().username)
        assertEquals("user-2", repository.getIceConfig(rotated).servers.single().username)
        assertEquals("user-3", repository.getIceConfig(null).servers.single().username)

        assertEquals(3, calls)
        assertEquals(listOf(first, rotated, null), seenAccess)
    }
}
