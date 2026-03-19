const ALLOWED_EMOJIS = new Set(["👍", "❤️", "😂", "😮", "😢", "🔥"]);

function attachReactionHandlers(io, state, socket) {
  socket.on("add_reaction", (data) => {
    const { roomId, messageId, emoji } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!messageId || typeof messageId !== "string") return;
    if (!emoji || !ALLOWED_EMOJIS.has(emoji)) return;

    if (!state.roomReactions.has(roomId)) {
      state.roomReactions.set(roomId, new Map());
    }
    const roomMap = state.roomReactions.get(roomId);

    if (!roomMap.has(messageId)) {
      roomMap.set(messageId, {});
    }
    const msgReactions = roomMap.get(messageId);

    if (!msgReactions[emoji]) {
      msgReactions[emoji] = new Set();
    }

    // Toggle: remove if already reacted, add if not
    if (msgReactions[emoji].has(socket.id)) {
      msgReactions[emoji].delete(socket.id);
      if (msgReactions[emoji].size === 0) {
        delete msgReactions[emoji];
      }
    } else {
      msgReactions[emoji].add(socket.id);
    }

    // Serialize: { [emoji]: socketId[] }
    const serialized = {};
    for (const [e, ids] of Object.entries(msgReactions)) {
      serialized[e] = Array.from(ids);
    }

    io.to(roomId).emit("reaction_updated", { messageId, reactions: serialized });
  });
}

module.exports = { attachReactionHandlers };
