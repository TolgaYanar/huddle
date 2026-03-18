const {
  ensureRoomHost,
  emitRoomUsersToRoom,
  emitRoomUsersSnapshotToSocket,
} = require("../helpers/users");
const { emitWheelStateTo } = require("../helpers/wheel");
const { emitPlaylistStateTo } = require("../helpers/playlists");
const { emitRoomStateToSocket } = require("../helpers/sync");
const { emitChatHistoryToSocket } = require("../helpers/chat");
const { emitActivityHistory } = require("../helpers/activity");

function attachJoinRoomHandler(io, state, socket, joinedRooms, deps) {
  socket.on("join_room", async (payload) => {
    const roomId =
      typeof payload === "string"
        ? payload
        : payload && typeof payload === "object"
          ? payload.roomId
          : undefined;
    const password =
      typeof payload === "object" && payload ? payload.password : undefined;

    if (!roomId || typeof roomId !== "string") return;

    const banned = state.roomBans.get(roomId);
    if (banned && banned.has(socket.id)) {
      socket.emit("room_banned", { roomId });
      return;
    }

    const storedHash = state.roomPasswordHash.get(roomId);
    if (storedHash) {
      const ok = deps.verifyPassword(password, storedHash);
      if (!ok) {
        socket.emit("room_requires_password", {
          roomId,
          reason: password ? "invalid" : "required",
        });
        return;
      }
    }

    // If the client re-sends join_room, don't spam activity or join events.
    if (socket.rooms.has(roomId)) {
      try {
        if (!socket.data.roomJoinedAt) socket.data.roomJoinedAt = {};
        socket.data.roomJoinedAt[roomId] = Date.now();
      } catch {
        // ignore
      }

      try {
        ensureRoomHost(io, state, roomId, socket.id);
        emitRoomUsersSnapshotToSocket(io, state, socket, roomId);
        emitRoomUsersToRoom(io, state, roomId);

        socket.emit("room_password_status", {
          roomId,
          hasPassword: state.roomPasswordHash.has(roomId),
        });

        emitWheelStateTo(state, socket, roomId);
        await emitPlaylistStateTo(deps, state, socket, roomId);

        // Always re-send room state so reconnecting clients can re-sync.
        emitRoomStateToSocket(state, socket, roomId);
      } catch (err) {
        console.error("Failed to re-emit room snapshot", err);
      }
      return;
    }

    socket.join(roomId);
    joinedRooms.add(roomId);
    if (typeof deps.vLog === "function") {
      deps.vLog(`User ${socket.id} joined room: ${roomId}`);
    }

    // Track when this socket joined this room (stale-event guards).
    try {
      if (!socket.data.roomJoinedAt) socket.data.roomJoinedAt = {};
      socket.data.roomJoinedAt[roomId] = Date.now();
    } catch {
      // ignore
    }

    // Notify others in the room (optional)
    {
      const username =
        socket.data?.authUser?.username ||
        state.socketIdToUsername.get(socket.id) ||
        null;
      socket.to(roomId).emit("user_joined", { socketId: socket.id, username });
    }

    // Provide the joiner a list of current users so they can establish WebRTC.
    try {
      ensureRoomHost(io, state, roomId, socket.id);
      emitRoomUsersSnapshotToSocket(io, state, socket, roomId);
      emitRoomUsersToRoom(io, state, roomId);

      socket.emit("room_password_status", {
        roomId,
        hasPassword: state.roomPasswordHash.has(roomId),
      });

      emitWheelStateTo(state, socket, roomId);
      await emitPlaylistStateTo(deps, state, socket, roomId);
    } catch (err) {
      console.error("Failed to emit room_users", err);
      socket.emit("room_users", {
        roomId,
        users: [],
        usernames: {},
        mediaStates: {},
        hostId: state.roomHost.get(roomId) || null,
      });

      emitRoomUsersToRoom(io, state, roomId);

      socket.emit("room_password_status", {
        roomId,
        hasPassword: state.roomPasswordHash.has(roomId),
      });

      emitWheelStateTo(state, socket, roomId);
      await emitPlaylistStateTo(deps, state, socket, roomId);
    }

    // Persist join as an activity event.
    try {
      if (deps.isDbConnected() && deps.getPrisma()) {
        const senderUsername =
          socket.data?.authUser?.username ||
          state.socketIdToUsername.get(socket.id) ||
          null;
        const evt = await deps.getPrisma().roomActivity.create({
          data: {
            roomId,
            kind: "join",
            senderId: socket.id,
            senderUsername,
          },
        });

        socket.to(roomId).emit("activity_event", {
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
      console.error("Failed to persist join activity:", err.message);
    }

    // Send current room state to this new joiner.
    emitRoomStateToSocket(state, socket, roomId);

    // Send recent chat history for this room.
    await emitChatHistoryToSocket(deps, state, socket, roomId);

    await emitActivityHistory(deps, state, socket, roomId);
  });
}

module.exports = {
  attachJoinRoomHandler,
};
