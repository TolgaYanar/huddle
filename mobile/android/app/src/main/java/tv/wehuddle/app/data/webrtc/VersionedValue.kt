package tv.wehuddle.app.data.webrtc

/** Makes mutations inside JNI-owned objects observable through StateFlow. */
data class VersionedValue<T>(
    val value: T,
    val revision: Long,
)

internal fun <K, V> publishVersionedValue(
    current: Map<K, VersionedValue<V>>,
    key: K,
    value: V,
): Map<K, VersionedValue<V>> {
    val nextRevision = (current[key]?.revision ?: 0L) + 1L
    return current + (key to VersionedValue(value, nextRevision))
}
