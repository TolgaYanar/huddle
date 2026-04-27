const {
  normalizeRoomId,
  emitChatHistoryToSocket,
  persistOrFallbackChatMessage,
} = require("../helpers/chat");

function attachChatHandlers(io, state, socket, deps, isSocketInRoom) {
  // Per-socket sliding-window rate limit: max 5 messages per 3 seconds.
  const CHAT_RATE_WINDOW_MS = 3000;
  const CHAT_RATE_MAX = 5;
  const chatTimestamps = [];

  socket.on("request_chat_history", async (rawRoom) => {
    const roomId = normalizeRoomId(rawRoom);
    if (!roomId) return;
    // No strict membership check — clients (incl. the netflix-party
    // extension) emit this immediately after join_room, which awaits a
    // DB load before actually joining. The previous strict guard raced
    // and returned an empty history.
    await emitChatHistoryToSocket(deps, state, socket, roomId);
  });

  async function handleChatSend(data) {
    const { roomId, text } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (typeof text !== "string") return;

    if (!isSocketInRoom(roomId, socket.id)) return;

    const trimmed = text.trim();
    if (!trimmed) return;
    if (trimmed.length > 2000) return;

    // Rate limiting: max CHAT_RATE_MAX messages per CHAT_RATE_WINDOW_MS.
    const now = Date.now();
    while (chatTimestamps.length > 0 && now - chatTimestamps[0] >= CHAT_RATE_WINDOW_MS) {
      chatTimestamps.shift();
    }
    if (chatTimestamps.length >= CHAT_RATE_MAX) {
      socket.emit("chat_rate_limited", { roomId });
      return;
    }
    chatTimestamps.push(now);

    try {
      await persistOrFallbackChatMessage(
        deps,
        state,
        io,
        socket,
        roomId,
        trimmed,
      );
    } catch (err) {
      console.error("Failed to save chat message:", err.message);
    }
  }

  // Web uses send_chat; Android client historically used chat_message for sending.
  socket.on("send_chat", handleChatSend);
  socket.on("chat_message", handleChatSend);
}

module.exports = {
  attachChatHandlers,
};
