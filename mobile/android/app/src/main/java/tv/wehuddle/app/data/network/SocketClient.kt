package tv.wehuddle.app.data.network

import io.socket.client.IO
import io.socket.client.Socket
import io.socket.emitter.Emitter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.json.JSONArray
import org.json.JSONObject
import tv.wehuddle.app.BuildConfig
import tv.wehuddle.app.data.model.*
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Socket events for real-time communication
 */
sealed class SocketEvent {
    data object Connected : SocketEvent()
    data object Disconnected : SocketEvent()
    data class Error(val message: String) : SocketEvent()
    data class RoomUsers(val data: RoomUsersData) : SocketEvent()
    data class UserJoined(val data: UserJoinedEvent) : SocketEvent()
    data class UserLeft(val data: UserLeftEvent) : SocketEvent()
    data class SyncEvent(val data: SyncData) : SocketEvent()
    data class RoomState(val data: tv.wehuddle.app.data.model.RoomState) : SocketEvent()
    data class ChatMessageReceived(val data: ChatMessage) : SocketEvent()
    data class ChatHistoryReceived(val data: ChatHistory) : SocketEvent()
    data class ActivityEventReceived(val data: ActivityEvent) : SocketEvent()
    data class ActivityHistoryReceived(val data: ActivityHistory) : SocketEvent()
    data class PasswordStatus(val data: RoomPasswordStatus) : SocketEvent()
    data class PasswordRequired(val data: RoomPasswordRequired) : SocketEvent()
    data class WheelStateReceived(val data: WheelState) : SocketEvent()
    data class WheelSpun(val data: WheelSpunData) : SocketEvent()
    data class WebRTCOfferReceived(val data: WebRTCOffer) : SocketEvent()
    data class WebRTCAnswerReceived(val data: WebRTCAnswer) : SocketEvent()
    data class WebRTCIceReceived(val data: WebRTCIceCandidate) : SocketEvent()
    data class MediaStateReceived(val userId: String, val state: WebRTCMediaState) : SocketEvent()
    data class SpeakingStateReceived(val userId: String, val speaking: Boolean) : SocketEvent()
}

/**
 * Socket.IO client for real-time room communication
 */
@Singleton
class SocketClient @Inject constructor() {
    
    private val json = Json { 
        ignoreUnknownKeys = true 
        isLenient = true
    }
    
    private var socket: Socket? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    
    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()
    
    private val _events = MutableSharedFlow<SocketEvent>(extraBufferCapacity = 64)
    val events: SharedFlow<SocketEvent> = _events.asSharedFlow()
    
    private val _socketId = MutableStateFlow<String?>(null)
    val socketId: StateFlow<String?> = _socketId.asStateFlow()
    
    private var currentRoomId: String? = null
    
    /**
     * Connect to the socket server
     */
    fun connect() {
        if (socket?.connected() == true) return
        
        _connectionState.value = ConnectionState.CONNECTING
        
        try {
            val options = IO.Options().apply {
                transports = arrayOf("websocket")
                reconnection = true
                reconnectionAttempts = 10
                reconnectionDelay = 1000
                reconnectionDelayMax = 5000
                timeout = 20000
            }
            
            socket = IO.socket(BuildConfig.SOCKET_URL, options).apply {
                setupEventListeners()
                connect()
            }
        } catch (e: Exception) {
            _connectionState.value = ConnectionState.ERROR
            emitEvent(SocketEvent.Error(e.message ?: "Connection failed"))
        }
    }
    
    /**
     * Disconnect from the socket server
     */
    fun disconnect() {
        socket?.disconnect()
        socket?.off()
        socket = null
        _connectionState.value = ConnectionState.DISCONNECTED
        _socketId.value = null
        currentRoomId = null
    }
    
    /**
     * Join a room
     */
    fun joinRoom(roomId: String, password: String? = null) {
        currentRoomId = roomId
        val data = JSONObject().apply {
            put("roomId", roomId)
            password?.let { put("password", it) }
        }
        socket?.emit("join_room", data)
    }
    
    /**
     * Leave current room
     */
    fun leaveRoom() {
        currentRoomId?.let { roomId ->
            socket?.emit("leave_room", JSONObject().put("roomId", roomId))
        }
        currentRoomId = null
    }
    
    /**
     * Set room password (host only)
     */
    fun setRoomPassword(roomId: String, password: String) {
        val data = JSONObject().apply {
            put("roomId", roomId)
            put("password", password)
        }
        socket?.emit("set_room_password", data)
    }
    
    /**
     * Send sync event (play, pause, seek, change_url)
     */
    fun sendSyncEvent(syncData: SyncData) {
        val data = JSONObject().apply {
            put("roomId", syncData.roomId)
            put("action", syncData.action.name)
            put("timestamp", syncData.timestamp)
            syncData.videoUrl?.let { put("videoUrl", it) }
            syncData.senderId?.let { put("senderId", it) }
        }
        // Align with server/web naming: emit "sync_video"
        socket?.emit("sync_video", data)
    }
    
    /**
     * Request current room state
     */
    fun requestRoomState(roomId: String) {
        socket?.emit("request_room_state", JSONObject().put("roomId", roomId))
    }
    
    /**
     * Send chat message
     */
    fun sendChatMessage(roomId: String, text: String) {
        val data = JSONObject().apply {
            put("roomId", roomId)
            put("text", text)
        }
        socket?.emit("chat_message", data)
    }
    
    /**
     * Request chat history
     */
    fun requestChatHistory(roomId: String) {
        socket?.emit("request_chat_history", JSONObject().put("roomId", roomId))
    }
    
    /**
     * Request activity history
     */
    fun requestActivityHistory(roomId: String) {
        socket?.emit("request_activity_history", JSONObject().put("roomId", roomId))
    }
    
    // Wheel picker methods
    fun requestWheelState(roomId: String) {
        socket?.emit("request_wheel_state", JSONObject().put("roomId", roomId))
    }
    
    fun addWheelEntry(roomId: String, entry: String) {
        val data = JSONObject().apply {
            put("roomId", roomId)
            put("entry", entry)
        }
        socket?.emit("add_wheel_entry", data)
    }
    
    fun removeWheelEntry(roomId: String, index: Int) {
        val data = JSONObject().apply {
            put("roomId", roomId)
            put("index", index)
        }
        socket?.emit("remove_wheel_entry", data)
    }
    
    fun clearWheelEntries(roomId: String) {
        socket?.emit("clear_wheel_entries", JSONObject().put("roomId", roomId))
    }
    
    fun spinWheel(roomId: String) {
        socket?.emit("spin_wheel", JSONObject().put("roomId", roomId))
    }
    
    // WebRTC signaling methods
    fun sendWebRTCOffer(toId: String, sdp: String) {
        val data = JSONObject().apply {
            put("toId", toId)
            put("sdp", sdp)
        }
        socket?.emit("webrtc_offer", data)
    }
    
    fun sendWebRTCAnswer(toId: String, sdp: String) {
        val data = JSONObject().apply {
            put("toId", toId)
            put("sdp", sdp)
        }
        socket?.emit("webrtc_answer", data)
    }
    
    fun sendWebRTCIce(toId: String, candidate: String, sdpMid: String?, sdpMLineIndex: Int?) {
        val data = JSONObject().apply {
            put("toId", toId)
            put("candidate", candidate)
            sdpMid?.let { put("sdpMid", it) }
            sdpMLineIndex?.let { put("sdpMLineIndex", it) }
        }
        socket?.emit("webrtc_ice", data)
    }
    
    fun sendMediaState(roomId: String, state: WebRTCMediaState) {
        val data = JSONObject().apply {
            put("roomId", roomId)
            put("mic", state.mic)
            put("cam", state.cam)
            put("screen", state.screen)
        }
        socket?.emit("webrtc_media_state", data)
    }
    
    fun sendSpeakingState(roomId: String, speaking: Boolean) {
        val data = JSONObject().apply {
            put("roomId", roomId)
            put("speaking", speaking)
        }
        socket?.emit("webrtc_speaking", data)
    }
    
    fun kickUser(roomId: String, targetId: String) {
        val data = JSONObject().apply {
            put("roomId", roomId)
            put("targetId", targetId)
        }
        socket?.emit("kick_user", data)
    }
    
    private fun Socket.setupEventListeners() {
        on(Socket.EVENT_CONNECT) {
            _connectionState.value = ConnectionState.CONNECTED
            _socketId.value = id()
            emitEvent(SocketEvent.Connected)
            
            // Rejoin room if we were in one
            currentRoomId?.let { joinRoom(it) }
        }
        
        on(Socket.EVENT_DISCONNECT) {
            _connectionState.value = ConnectionState.DISCONNECTED
            emitEvent(SocketEvent.Disconnected)
        }
        
        on(Socket.EVENT_CONNECT_ERROR) { args ->
            _connectionState.value = ConnectionState.ERROR
            val error = args.firstOrNull()?.toString() ?: "Connection error"
            emitEvent(SocketEvent.Error(error))
        }
        
        on("reconnecting") {
            _connectionState.value = ConnectionState.RECONNECTING
        }
        
        on("room_users") { args ->
            parseJsonObject(args) { obj ->
                val users = obj.optJSONArray("users")?.let { arr ->
                    (0 until arr.length()).map { arr.getString(it) }
                } ?: emptyList()
                
                val mediaStates = obj.optJSONObject("mediaStates")?.let { states ->
                    val map = mutableMapOf<String, WebRTCMediaState>()
                    val keys = states.keys()
                    while (keys.hasNext()) {
                        val key = keys.next() as String
                        states.optJSONObject(key)?.let { stateObj ->
                            map[key] = WebRTCMediaState(
                                mic = stateObj.optBoolean("mic", false),
                                cam = stateObj.optBoolean("cam", false),
                                screen = stateObj.optBoolean("screen", false)
                            )
                        }
                    }
                    map
                }
                
                val data = RoomUsersData(
                    roomId = obj.optString("roomId"),
                    users = users,
                    mediaStates = mediaStates,
                    hostId = obj.optString("hostId").takeIf { it.isNotEmpty() }
                )
                emitEvent(SocketEvent.RoomUsers(data))
            }
        }
        
        on("user_joined") { args ->
            parseJsonObject(args) { obj ->
                val data = UserJoinedEvent(
                    roomId = obj.optString("roomId"),
                    socketId = obj.optString("socketId")
                )
                emitEvent(SocketEvent.UserJoined(data))
            }
        }
        
        on("user_left") { args ->
            parseJsonObject(args) { obj ->
                val data = UserLeftEvent(
                    roomId = obj.optString("roomId"),
                    socketId = obj.optString("socketId")
                )
                emitEvent(SocketEvent.UserLeft(data))
            }
        }
        
        // Server broadcasts peer syncs via "receive_sync" (without roomId)
        on("receive_sync") { args ->
            parseJsonObject(args) { obj ->
                val data = SyncData(
                    roomId = currentRoomId ?: obj.optString("roomId"),
                    action = SyncAction.valueOf(obj.optString("action", "play")),
                    timestamp = obj.optDouble("timestamp", 0.0),
                    videoUrl = obj.optString("videoUrl").takeIf { it.isNotEmpty() },
                    senderId = obj.optString("senderId").takeIf { it.isNotEmpty() }
                )
                emitEvent(SocketEvent.SyncEvent(data))
            }
        }
        
        on("room_state") { args ->
            parseJsonObject(args) { obj ->
                val data = RoomState(
                    roomId = obj.optString("roomId"),
                    videoUrl = obj.optString("videoUrl").takeIf { it.isNotEmpty() },
                    timestamp = obj.optDouble("timestamp").takeIf { !it.isNaN() },
                    action = obj.optString("action").takeIf { it.isNotEmpty() }?.let { 
                        try { SyncAction.valueOf(it) } catch (e: Exception) { null }
                    },
                    updatedAt = obj.optLong("updatedAt").takeIf { it > 0 }
                )
                emitEvent(SocketEvent.RoomState(data))
            }
        }
        
        on("chat_message") { args ->
            parseJsonObject(args) { obj ->
                val data = ChatMessage(
                    id = obj.optString("id"),
                    roomId = obj.optString("roomId"),
                    senderId = obj.optString("senderId"),
                    text = obj.optString("text"),
                    createdAt = obj.optString("createdAt")
                )
                emitEvent(SocketEvent.ChatMessageReceived(data))
            }
        }
        
        on("chat_history") { args ->
            parseJsonObject(args) { obj ->
                val messages = obj.optJSONArray("messages")?.let { arr ->
                    (0 until arr.length()).mapNotNull { i ->
                        arr.optJSONObject(i)?.let { msgObj ->
                            ChatMessage(
                                id = msgObj.optString("id"),
                                roomId = msgObj.optString("roomId"),
                                senderId = msgObj.optString("senderId"),
                                text = msgObj.optString("text"),
                                createdAt = msgObj.optString("createdAt")
                            )
                        }
                    }
                } ?: emptyList()
                
                val data = ChatHistory(
                    roomId = obj.optString("roomId"),
                    messages = messages
                )
                emitEvent(SocketEvent.ChatHistoryReceived(data))
            }
        }
        
        on("activity_event") { args ->
            parseJsonObject(args) { obj ->
                val data = ActivityEvent(
                    id = obj.optString("id"),
                    roomId = obj.optString("roomId"),
                    kind = obj.optString("kind"),
                    action = obj.optString("action").takeIf { it.isNotEmpty() },
                    timestamp = obj.optDouble("timestamp").takeIf { !it.isNaN() },
                    videoUrl = obj.optString("videoUrl").takeIf { it.isNotEmpty() },
                    senderId = obj.optString("senderId").takeIf { it.isNotEmpty() },
                    createdAt = obj.optString("createdAt")
                )
                emitEvent(SocketEvent.ActivityEventReceived(data))
            }
        }
        
        on("activity_history") { args ->
            parseJsonObject(args) { obj ->
                val events = obj.optJSONArray("events")?.let { arr ->
                    (0 until arr.length()).mapNotNull { i ->
                        arr.optJSONObject(i)?.let { eventObj ->
                            ActivityEvent(
                                id = eventObj.optString("id"),
                                roomId = eventObj.optString("roomId"),
                                kind = eventObj.optString("kind"),
                                action = eventObj.optString("action").takeIf { it.isNotEmpty() },
                                timestamp = eventObj.optDouble("timestamp").takeIf { !it.isNaN() },
                                videoUrl = eventObj.optString("videoUrl").takeIf { it.isNotEmpty() },
                                senderId = eventObj.optString("senderId").takeIf { it.isNotEmpty() },
                                createdAt = eventObj.optString("createdAt")
                            )
                        }
                    }
                } ?: emptyList()
                
                val data = ActivityHistory(
                    roomId = obj.optString("roomId"),
                    events = events
                )
                emitEvent(SocketEvent.ActivityHistoryReceived(data))
            }
        }
        
        on("room_password_status") { args ->
            parseJsonObject(args) { obj ->
                val data = RoomPasswordStatus(
                    roomId = obj.optString("roomId"),
                    hasPassword = obj.optBoolean("hasPassword", false)
                )
                emitEvent(SocketEvent.PasswordStatus(data))
            }
        }
        
        on("room_password_required") { args ->
            parseJsonObject(args) { obj ->
                val data = RoomPasswordRequired(
                    roomId = obj.optString("roomId"),
                    reason = obj.optString("reason").takeIf { it.isNotEmpty() }
                )
                emitEvent(SocketEvent.PasswordRequired(data))
            }
        }
        
        on("wheel_state") { args ->
            parseJsonObject(args) { obj ->
                val entries = obj.optJSONArray("entries")?.let { arr ->
                    (0 until arr.length()).map { arr.getString(it) }
                } ?: emptyList()
                
                val lastSpin = obj.optJSONObject("lastSpin")?.let { spinObj ->
                    WheelSpinData(
                        index = spinObj.optInt("index"),
                        result = spinObj.optString("result"),
                        entryCount = spinObj.optInt("entryCount"),
                        spunAt = spinObj.optLong("spunAt"),
                        senderId = spinObj.optString("senderId").takeIf { it.isNotEmpty() }
                    )
                }
                
                val data = WheelState(
                    roomId = obj.optString("roomId"),
                    entries = entries,
                    lastSpin = lastSpin
                )
                emitEvent(SocketEvent.WheelStateReceived(data))
            }
        }
        
        on("wheel_spun") { args ->
            parseJsonObject(args) { obj ->
                val entries = obj.optJSONArray("entries")?.let { arr ->
                    (0 until arr.length()).map { arr.getString(it) }
                }
                
                val data = WheelSpunData(
                    roomId = obj.optString("roomId"),
                    index = obj.optInt("index"),
                    result = obj.optString("result"),
                    entryCount = obj.optInt("entryCount"),
                    spunAt = obj.optLong("spunAt"),
                    senderId = obj.optString("senderId").takeIf { it.isNotEmpty() },
                    entries = entries
                )
                emitEvent(SocketEvent.WheelSpun(data))
            }
        }
        
        on("webrtc_offer") { args ->
            parseJsonObject(args) { obj ->
                val data = WebRTCOffer(
                    fromId = obj.optString("fromId"),
                    toId = obj.optString("toId"),
                    sdp = obj.optString("sdp")
                )
                emitEvent(SocketEvent.WebRTCOfferReceived(data))
            }
        }
        
        on("webrtc_answer") { args ->
            parseJsonObject(args) { obj ->
                val data = WebRTCAnswer(
                    fromId = obj.optString("fromId"),
                    toId = obj.optString("toId"),
                    sdp = obj.optString("sdp")
                )
                emitEvent(SocketEvent.WebRTCAnswerReceived(data))
            }
        }
        
        on("webrtc_ice") { args ->
            parseJsonObject(args) { obj ->
                val data = WebRTCIceCandidate(
                    fromId = obj.optString("fromId"),
                    toId = obj.optString("toId"),
                    candidate = obj.optString("candidate"),
                    sdpMid = obj.optString("sdpMid").takeIf { it.isNotEmpty() },
                    sdpMLineIndex = obj.optInt("sdpMLineIndex", -1).takeIf { it >= 0 }
                )
                emitEvent(SocketEvent.WebRTCIceReceived(data))
            }
        }
        
        on("webrtc_media_state") { args ->
            parseJsonObject(args) { obj ->
                val userId = obj.optString("senderId")
                val state = WebRTCMediaState(
                    mic = obj.optBoolean("mic", false),
                    cam = obj.optBoolean("cam", false),
                    screen = obj.optBoolean("screen", false)
                )
                emitEvent(SocketEvent.MediaStateReceived(userId, state))
            }
        }
        
        on("webrtc_speaking") { args ->
            parseJsonObject(args) { obj ->
                val userId = obj.optString("senderId")
                val speaking = obj.optBoolean("speaking", false)
                emitEvent(SocketEvent.SpeakingStateReceived(userId, speaking))
            }
        }
    }
    
    private inline fun parseJsonObject(args: Array<Any>, block: (JSONObject) -> Unit) {
        try {
            val obj = when (val arg = args.firstOrNull()) {
                is JSONObject -> arg
                is String -> JSONObject(arg)
                else -> return
            }
            block(obj)
        } catch (e: Exception) {
            // Log error in production
        }
    }
    
    private fun emitEvent(event: SocketEvent) {
        scope.launch {
            _events.emit(event)
        }
    }
}
