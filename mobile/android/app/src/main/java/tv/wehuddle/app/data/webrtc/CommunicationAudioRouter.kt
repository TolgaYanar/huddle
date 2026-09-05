package tv.wehuddle.app.data.webrtc

import android.content.Context
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Process-wide ownership of Android's communication audio route.
 *
 * Room view models can briefly overlap during navigation. Reference-counted
 * ownership prevents the old room from restoring media audio while the new
 * room is already capturing or playing voice.
 */
@Singleton
@Suppress("DEPRECATION")
class CommunicationAudioRouter @Inject constructor(
    @ApplicationContext context: Context,
) {
    private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val lock = Any()
    private val owners = mutableSetOf<String>()
    private var previousMode: Int? = null
    private var previousSpeakerphone: Boolean? = null
    private var previousBluetoothSco: Boolean? = null
    private var previousCommunicationDevice: AudioDeviceInfo? = null
    private var bluetoothScoStartedByUs = false
    private var callbackRegistered = false

    private val deviceCallback = object : AudioDeviceCallback() {
        override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>?) {
            synchronized(lock) {
                if (owners.isNotEmpty()) routeCommunicationAudio()
            }
        }

        override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>?) {
            synchronized(lock) {
                if (owners.isNotEmpty()) routeCommunicationAudio()
            }
        }
    }

    fun acquire(owner: String) = synchronized(lock) {
        if (!owners.add(owner)) {
            routeCommunicationAudio()
            return@synchronized
        }
        if (owners.size == 1) {
            previousMode = audioManager.mode
            previousSpeakerphone = audioManager.isSpeakerphoneOn
            previousBluetoothSco = audioManager.isBluetoothScoOn
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                previousCommunicationDevice = audioManager.communicationDevice
            }
            registerDeviceCallback()
        }
        routeCommunicationAudio()
    }

    fun release(owner: String) = synchronized(lock) {
        if (!owners.remove(owner)) return@synchronized
        if (owners.isEmpty()) {
            unregisterDeviceCallback()
            restorePreviousRoute()
        } else {
            routeCommunicationAudio()
        }
    }

    @Suppress("DEPRECATION")
    private fun routeCommunicationAudio() {
        try {
            audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val devices = audioManager.availableCommunicationDevices
                val currentExternal = audioManager.communicationDevice
                    ?.takeIf(::isVoiceCapableExternalDevice)
                val preferred = currentExternal
                    ?: devices.firstOrNull(::isVoiceCapableExternalDevice)
                    ?: devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
                if (preferred != null && !audioManager.setCommunicationDevice(preferred)) {
                    Log.w(TAG, "Android rejected communication route type ${preferred.type}")
                }
                return
            }

            val outputs = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
            val wired = outputs.any {
                it.type == AudioDeviceInfo.TYPE_WIRED_HEADSET ||
                    it.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES ||
                    it.type == AudioDeviceInfo.TYPE_USB_DEVICE ||
                    it.type == AudioDeviceInfo.TYPE_USB_HEADSET
            }
            val bluetoothAvailable = audioManager.isBluetoothA2dpOn || outputs.any {
                it.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
                    it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO
            }

            when {
                wired -> {
                    stopOwnedBluetoothSco()
                    audioManager.isSpeakerphoneOn = false
                }
                bluetoothAvailable && audioManager.isBluetoothScoAvailableOffCall -> {
                    audioManager.isSpeakerphoneOn = false
                    if (!audioManager.isBluetoothScoOn) {
                        audioManager.startBluetoothSco()
                        audioManager.isBluetoothScoOn = true
                        bluetoothScoStartedByUs = true
                    }
                }
                else -> {
                    stopOwnedBluetoothSco()
                    audioManager.isSpeakerphoneOn = true
                }
            }
        } catch (error: Exception) {
            Log.w(TAG, "Failed to route communication audio", error)
        }
    }

    @Suppress("DEPRECATION")
    private fun restorePreviousRoute() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                audioManager.clearCommunicationDevice()
                previousCommunicationDevice?.takeIf { previous ->
                    audioManager.availableCommunicationDevices.any { it.id == previous.id }
                }?.let(audioManager::setCommunicationDevice)
            } else {
                stopOwnedBluetoothSco()
                previousBluetoothSco?.let { wasOn ->
                    if (wasOn && !audioManager.isBluetoothScoOn) {
                        audioManager.startBluetoothSco()
                        audioManager.isBluetoothScoOn = true
                    }
                }
                previousSpeakerphone?.let { audioManager.isSpeakerphoneOn = it }
            }
            previousMode?.let { audioManager.mode = it }
        } catch (error: Exception) {
            Log.w(TAG, "Failed to restore the previous audio route", error)
        } finally {
            previousMode = null
            previousSpeakerphone = null
            previousBluetoothSco = null
            previousCommunicationDevice = null
            bluetoothScoStartedByUs = false
        }
    }

    @Suppress("DEPRECATION")
    private fun stopOwnedBluetoothSco() {
        if (!bluetoothScoStartedByUs) return
        audioManager.stopBluetoothSco()
        audioManager.isBluetoothScoOn = false
        bluetoothScoStartedByUs = false
    }

    private fun registerDeviceCallback() {
        if (callbackRegistered) return
        audioManager.registerAudioDeviceCallback(deviceCallback, Handler(Looper.getMainLooper()))
        callbackRegistered = true
    }

    private fun unregisterDeviceCallback() {
        if (!callbackRegistered) return
        audioManager.unregisterAudioDeviceCallback(deviceCallback)
        callbackRegistered = false
    }

    private fun isVoiceCapableExternalDevice(device: AudioDeviceInfo): Boolean = when (device.type) {
        AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
        AudioDeviceInfo.TYPE_WIRED_HEADSET,
        AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
        AudioDeviceInfo.TYPE_USB_DEVICE,
        AudioDeviceInfo.TYPE_USB_HEADSET,
        AudioDeviceInfo.TYPE_HEARING_AID,
        AudioDeviceInfo.TYPE_BLE_HEADSET -> true
        else -> false
    }

    private companion object {
        const val TAG = "CommunicationAudio"
    }
}
