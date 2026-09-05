package tv.wehuddle.app.data.webrtc

import java.util.Collections
import java.util.concurrent.ConcurrentHashMap

/** Thread-safe bounded buffer for signaling that arrives before its peer. */
internal class GenerationBuffer<T>(private val maxPerPeer: Int) {
    private data class Entry<T>(val value: T, val generation: String?)

    private val entries = ConcurrentHashMap<String, MutableList<Entry<T>>>()

    fun ensurePeer(peerId: String) {
        entries.putIfAbsent(peerId, Collections.synchronizedList(mutableListOf()))
    }

    fun add(peerId: String, value: T, generation: String?): Boolean {
        val peerEntries = entries.computeIfAbsent(peerId) {
            Collections.synchronizedList(mutableListOf())
        }
        synchronized(peerEntries) {
            val retainedWithoutEviction = peerEntries.size < maxPerPeer
            if (!retainedWithoutEviction) {
                // Prefer a fresh candidate over an arbitrarily old one. This
                // prevents a stale generation from permanently blocking the
                // bounded queue for the peer.
                peerEntries.removeAt(0)
            }
            peerEntries.add(Entry(value, generation))
            return retainedWithoutEviction
        }
    }

    fun drain(peerId: String, acceptsGeneration: (String?) -> Boolean): List<T> {
        val peerEntries = entries[peerId] ?: return emptyList()
        return synchronized(peerEntries) {
            val accepted = mutableListOf<T>()
            val iterator = peerEntries.iterator()
            while (iterator.hasNext()) {
                val entry = iterator.next()
                if (acceptsGeneration(entry.generation)) {
                    accepted += entry.value
                    iterator.remove()
                }
            }
            accepted
        }
    }

    fun remove(peerId: String) {
        entries.remove(peerId)
    }

    fun retainPeers(peerIds: Set<String>) {
        entries.keys.removeIf { it !in peerIds }
    }

    fun clear() {
        entries.clear()
    }
}
