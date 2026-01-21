function attachModerationHandlers(io, state, socket, deps) {
  // Host-only: set or clear room password.
  socket.on("set_room_password", async (data) => {
    const { roomId, password } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (state.roomHost.get(roomId) !== socket.id) return;

    const pw = typeof password === "string" ? password : "";
    if (!pw) {
      state.roomPasswordHash.delete(roomId);
      io.to(roomId).emit("room_password_status", {
        roomId,
        hasPassword: false,
      });
      return;
    }

    state.roomPasswordHash.set(roomId, deps.hashPassword(pw));
    io.to(roomId).emit("room_password_status", {
      roomId,
      hasPassword: true,
    });

    // Optional audit event.
    try {
      if (deps.isDbConnected() && deps.getPrisma()) {
        const senderUsername =
          socket.data?.authUser?.username ||
          state.socketIdToUsername.get(socket.id) ||
          null;
        const evt = await deps.getPrisma().roomActivity.create({
          data: {
            roomId,
            kind: "password",
            senderId: socket.id,
            senderUsername,
          },
        });
        io.to(roomId).emit("activity_event", {
          id: evt.id,
          roomId: evt.roomId,
          kind: evt.kind,
          action: evt.action,
          timestamp: evt.timestamp,
          videoUrl: evt.videoUrl,
          senderId: evt.senderId,
          senderUsername: evt.senderUsername ?? senderUsername,
          createdAt: evt.createdAt,
        });
      }
    } catch (err) {
      console.error("Failed to persist password activity:", err.message);
    }
  });

  // Host-only: kick + ban (in-memory) a target socket from a room.
  socket.on("kick_user", async (data) => {
    const { roomId, targetId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!targetId || typeof targetId !== "string") return;
    if (state.roomHost.get(roomId) !== socket.id) return;

    // Add to ban list for this room.
    let banned = state.roomBans.get(roomId);
    if (!banned) {
      banned = new Set();
      state.roomBans.set(roomId, banned);
    }
    banned.add(targetId);

    // Optional audit event.
    try {
      if (deps.isDbConnected() && deps.getPrisma()) {
        const senderUsername =
          socket.data?.authUser?.username ||
          state.socketIdToUsername.get(socket.id) ||
          null;
        const evt = await deps.getPrisma().roomActivity.create({
          data: {
            roomId,
            kind: "kick",
            senderId: socket.id,
            senderUsername,
          },
        });
        io.to(roomId).emit("activity_event", {
          id: evt.id,
          roomId: evt.roomId,
          kind: evt.kind,
          action: evt.action,
          timestamp: evt.timestamp,
          videoUrl: evt.videoUrl,
          senderId: evt.senderId,
          senderUsername: evt.senderUsername ?? senderUsername,
          createdAt: evt.createdAt,
        });
      }
    } catch (err) {
      console.error("Failed to persist kick activity:", err.message);
    }

    // Notify + disconnect the target.
    io.to(targetId).emit("room_banned", { roomId });
    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) {
      try {
        targetSocket.disconnect(true);
      } catch {
        // ignore
      }
    }
  });
}

module.exports = {
  attachModerationHandlers,
};
