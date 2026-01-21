const crypto = require("crypto");

function normalizeRoomId(raw) {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw.roomId === "string") return raw.roomId;
  return null;
}

function pushRoomChatMessage(state, roomId, msg) {
  if (!roomId || !msg) return;
  const list = state.roomChatHistory.get(roomId) || [];
  list.push(msg);
  while (list.length > state.CHAT_HISTORY_LIMIT) list.shift();
  state.roomChatHistory.set(roomId, list);
}

async function emitChatHistoryToSocket(deps, state, socket, roomId) {
  try {
    if (deps.isDbConnected() && deps.getPrisma()) {
      const recent = await deps.getPrisma().roomMessage.findMany({
        where: { roomId },
        orderBy: { createdAt: "desc" },
        take: state.CHAT_HISTORY_LIMIT,
      });

      socket.emit("chat_history", {
        roomId,
        messages: recent.reverse().map((m) => ({
          id: m.id,
          roomId: m.roomId,
          senderId: m.senderId,
          senderUsername: m.senderUsername ?? null,
          text: m.text,
          createdAt: m.createdAt,
        })),
      });
      return;
    }

    socket.emit("chat_history", {
      roomId,
      messages: (state.roomChatHistory.get(roomId) || []).slice(
        -state.CHAT_HISTORY_LIMIT,
      ),
    });
  } catch (err) {
    console.error("Failed to load chat history:", err.message);
    socket.emit("chat_history", {
      roomId,
      messages: (state.roomChatHistory.get(roomId) || []).slice(
        -state.CHAT_HISTORY_LIMIT,
      ),
    });
  }
}

async function persistOrFallbackChatMessage(
  deps,
  state,
  io,
  socket,
  roomId,
  text,
) {
  const senderUsername =
    socket.data?.authUser?.username ||
    state.socketIdToUsername.get(socket.id) ||
    null;

  if (deps.isDbConnected() && deps.getPrisma()) {
    const msg = await deps.getPrisma().roomMessage.create({
      data: {
        roomId,
        senderId: socket.id,
        senderUsername,
        text,
      },
    });

    io.to(roomId).emit("chat_message", {
      id: msg.id,
      roomId: msg.roomId,
      senderId: msg.senderId,
      senderUsername: msg.senderUsername ?? senderUsername,
      text: msg.text,
      createdAt: msg.createdAt,
    });
    return;
  }

  const msg = {
    id: crypto.randomUUID(),
    roomId,
    senderId: socket.id,
    senderUsername,
    text,
    createdAt: new Date(),
  };
  pushRoomChatMessage(state, roomId, msg);
  io.to(roomId).emit("chat_message", msg);
}

module.exports = {
  normalizeRoomId,
  pushRoomChatMessage,
  emitChatHistoryToSocket,
  persistOrFallbackChatMessage,
};
