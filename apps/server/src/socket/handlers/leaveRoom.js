const { emitRoomUsersToRoom } = require("../helpers/users");
const {
  anchorRoomStateOnEmpty,
  persistRoomState,
} = require("../helpers/sync");

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

    // Compute who is left after this socket leaves (socket.leave above has
    // usually already removed us from the adapter room, but filter on id too
    // to be robust), independent of host status.
    const room = io.sockets.adapter.rooms.get(roomId);
    const remaining = room
      ? Array.from(room).filter((id) => id !== socket.id)
      : [];
    const roomNowEmpty = remaining.length === 0;

    // Reassign host if needed.
    if (state.roomHost.get(roomId) === socket.id) {
      if (!roomNowEmpty) {
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

    // Pause-anchor + persist on last-leave so a late joiner doesn't inherit an
    // absurd extrapolated timestamp. We intentionally do NOT clear the
    // per-room maps here — that aggressive cleanup is deferred to Phase 3.
    if (roomNowEmpty) {
      const anchored = anchorRoomStateOnEmpty(state, roomId);
      if (anchored) {
        persistRoomState(deps, state, roomId).catch(() => {});
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
