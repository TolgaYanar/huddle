package tv.wehuddle.app.data.webrtc

/**
 * Small PCM16 voice activity detector used only for the speaking highlight.
 * Audio transmission never depends on it.
 */
internal class SpeakingDetector(
    private val threshold: Int = 1_000,
    private val hangoverMillis: Long = 450L,
) {
    private var lastVoiceAtMillis: Long? = null
    private var speaking = false

    /** Returns a new speaking state only when it changes. */
    @Synchronized
    fun updatePcm16(data: ByteArray, nowMillis: Long): Boolean? {
        if (isAboveThreshold(data)) {
            lastVoiceAtMillis = nowMillis
        }
        val next = lastVoiceAtMillis?.let { nowMillis - it < hangoverMillis } == true
        if (next == speaking) return null
        speaking = next
        return next
    }

    /** Clears hangover state and returns false only if callers must broadcast it. */
    @Synchronized
    fun reset(): Boolean? {
        lastVoiceAtMillis = null
        if (!speaking) return null
        speaking = false
        return false
    }

    private fun isAboveThreshold(data: ByteArray): Boolean {
        val sampleCount = data.size / 2
        if (sampleCount == 0) return false

        var squaredSum = 0L
        var index = 0
        while (index + 1 < data.size) {
            val sample = (
                (data[index].toInt() and 0xff) or
                    (data[index + 1].toInt() shl 8)
                ).toShort().toInt()
            squaredSum += sample.toLong() * sample
            index += 2
        }
        return squaredSum / sampleCount >= threshold.toLong() * threshold
    }
}
