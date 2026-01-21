const {
  normalizeRoomId,
  emitChatHistoryToSocket,
  persistOrFallbackChatMessage,
} = require("../helpers/chat");

function attachChatHandlers(io, state, socket, deps, isSocketInRoom) {
  socket.on("request_chat_history", async (rawRoom) => {
    const roomId = normalizeRoomId(rawRoom);
    if (!roomId) return;
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
