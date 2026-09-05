package tv.wehuddle.app.data.webrtc

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeout
import tv.wehuddle.app.data.network.HuddleApiService
import tv.wehuddle.app.data.network.IceConfigResponse
import java.security.MessageDigest
import javax.inject.Inject
import javax.inject.Singleton

data class IceServerConfiguration(
    val urls: List<String>,
    val username: String? = null,
    val credential: String? = null,
)

data class IceConfig(
    val servers: List<IceServerConfiguration>,
    val ttlSeconds: Long?,
    val isFallback: Boolean,
)

/** Proof that this socket has successfully joined this room. */
internal data class IceAccessContext(
    val roomId: String,
    val socketId: String,
    val token: String,
)

/**
 * Fetches short-lived ICE credentials from the Huddle API.
 *
 * The cache expires before the credential itself so a newly-created peer
 * connection never starts with a credential that is about to expire. A
 * network failure is cached briefly to avoid turning a temporary outage into
 * a request storm; calls continue with STUN while the API is unavailable.
 */
@Singleton
class IceConfigRepository internal constructor(
    private val fetchConfig: suspend (IceAccessContext?) -> IceConfigResponse,
    private val clockMillis: () -> Long,
    private val requestTimeoutMillis: Long,
) {
    @Inject
    constructor(api: HuddleApiService) : this(
        fetchConfig = { access ->
            api.getIceConfig(
                roomId = access?.roomId,
                socketId = access?.socketId,
                roomToken = access?.token,
            )
        },
        clockMillis = System::currentTimeMillis,
        requestTimeoutMillis = REQUEST_TIMEOUT_MILLIS,
    )

    private data class CacheKey(
        val roomId: String?,
        val socketId: String?,
        val tokenDigest: String?,
    )

    private data class Cached(
        val key: CacheKey,
        val config: IceConfig,
        val expiresAtMillis: Long,
    )

    private val mutex = Mutex()
    private var cached: Cached? = null

    internal suspend fun getIceConfig(
        access: IceAccessContext? = null,
        forceRefresh: Boolean = false,
    ): IceConfig = mutex.withLock {
        val now = clockMillis()
        val key = access.toCacheKey()
        cached?.takeIf {
            !forceRefresh && it.key == key && now < it.expiresAtMillis
        }?.let {
            return@withLock it.config
        }

        val result = try {
            val response = withTimeout(requestTimeoutMillis) { fetchConfig(access) }
            val validated = validate(response)
            val cacheForMillis = response.ttlSeconds
                ?.coerceIn(MIN_TTL_SECONDS, MAX_TTL_SECONDS)
                ?.times(800L)
                ?: STATIC_CONFIG_CACHE_MILLIS
            Cached(key, validated, now + cacheForMillis)
        } catch (_: TimeoutCancellationException) {
            Cached(key, fallbackConfig(), now + FAILURE_CACHE_MILLIS)
        } catch (error: CancellationException) {
            throw error
        } catch (_: Exception) {
            Cached(key, fallbackConfig(), now + FAILURE_CACHE_MILLIS)
        }

        cached = result
        result.config
    }

    private fun IceAccessContext?.toCacheKey(): CacheKey {
        if (this == null) return CacheKey(null, null, null)
        val digest = MessageDigest.getInstance("SHA-256")
            .digest(token.toByteArray(Charsets.UTF_8))
            .joinToString(separator = "") { byte -> "%02x".format(byte) }
        return CacheKey(roomId, socketId, digest)
    }

    private fun validate(response: IceConfigResponse): IceConfig {
        val servers = response.iceServers.mapNotNull { server ->
            val urls = server.urls
                .map(String::trim)
                .filter(String::isNotEmpty)
                .filter(::isAllowedIceUrl)
                .distinct()
            if (urls.isEmpty()) return@mapNotNull null

            val hasTurn = urls.any(::isTurnUrl)
            val username = server.username?.trim()?.takeIf(String::isNotEmpty)
            val credential = server.credential?.trim()?.takeIf(String::isNotEmpty)
            if (hasTurn && (username == null || credential == null)) {
                return@mapNotNull null
            }

            IceServerConfiguration(
                urls = urls,
                username = username,
                credential = credential,
            )
        }

        return IceConfig(
            servers = servers.ifEmpty { FALLBACK_SERVERS },
            ttlSeconds = response.ttlSeconds?.coerceIn(MIN_TTL_SECONDS, MAX_TTL_SECONDS),
            isFallback = servers.isEmpty(),
        )
    }

    companion object {
        private const val REQUEST_TIMEOUT_MILLIS = 3_000L
        private const val FAILURE_CACHE_MILLIS = 60_000L
        private const val STATIC_CONFIG_CACHE_MILLIS = 5 * 60_000L
        private const val MIN_TTL_SECONDS = 60L
        private const val MAX_TTL_SECONDS = 7 * 24 * 60 * 60L

        val FALLBACK_SERVERS = listOf(
            IceServerConfiguration(listOf("stun:stun.l.google.com:19302")),
        )

        fun fallbackConfig() = IceConfig(
            servers = FALLBACK_SERVERS,
            ttlSeconds = null,
            isFallback = true,
        )

        private fun isAllowedIceUrl(url: String): Boolean {
            val separator = url.indexOf(':')
            if (separator <= 0 || separator == url.lastIndex) return false
            if (url.any(Char::isWhitespace)) return false
            return url.substring(0, separator) in setOf("stun", "stuns", "turn", "turns")
        }

        private fun isTurnUrl(url: String): Boolean {
            val scheme = url.substringBefore(':')
            return scheme == "turn" || scheme == "turns"
        }
    }
}
