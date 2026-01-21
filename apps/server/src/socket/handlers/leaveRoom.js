const { emitRoomUsersToRoom } = require("../helpers/users");

function attachLeaveRoomHandler(io, state, socket, joinedRooms, deps) {
  socket.on("leave_room", async (payload) => {
    const roomId =
      typeof payload === "string"
        ? payload
        : payload && typeof payload === "object"
          ? payload.roomId
          : undefined;

    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    try {
      socket.leave(roomId);
    } catch {
      // ignore
    }
    joinedRooms.delete(roomId);

    // Clean up in-memory media state.
    const map = state.roomMediaState.get(roomId);
    if (map) {
      map.delete(socket.id);
      if (map.size === 0) state.roomMediaState.delete(roomId);
    }

    // Notify peers for WebRTC cleanup.
    {
      const username =
        socket.data?.authUser?.username ||
        state.socketIdToUsername.get(socket.id) ||
        null;
      socket.to(roomId).emit("user_left", { socketId: socket.id, username });
    }
    socket.to(roomId).emit("webrtc_speaking", {
      roomId,
      from: socket.id,
      speaking: false,
    });
    socket.to(roomId).emit("webrtc_media_state", {
      roomId,
      from: socket.id,
      state: { mic: false, cam: false, screen: false },
    });

    // Reassign host if needed.
    if (state.roomHost.get(roomId) === socket.id) {
      const room = io.sockets.adapter.rooms.get(roomId);
      const remaining = room ? Array.from(room) : [];

      if (remaining.length > 0) {
        state.roomHost.set(roomId, remaining[0]);
        io.to(roomId).emit("room_host", {
          roomId,
          hostId: state.roomHost.get(roomId),
        });
      } else {
        state.roomHost.delete(roomId);
        state.roomBans.delete(roomId);
        state.roomPasswordHash.delete(roomId);
        state.roomWheel.delete(roomId);
      }
    }

    // Broadcast an authoritative snapshot so all clients reconcile.
    emitRoomUsersToRoom(io, state, roomId);

    // Persist leave as an activity event.
    try {
      if (deps.isDbConnected() && deps.getPrisma()) {
        const senderUsername =
          socket.data?.authUser?.username ||
          state.socketIdToUsername.get(socket.id) ||
          null;

        const evt = await deps.getPrisma().roomActivity.create({
          data: {
            roomId,
            kind: "leave",
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
      console.error("Failed to persist explicit leave activity:", err.message);
    }
  });
}

module.exports = {
  attachLeaveRoomHandler,
};
