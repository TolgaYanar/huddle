const {
  ensureRoomHost,
  emitRoomUsersToRoom,
  emitRoomUsersSnapshotToSocket,
} = require("../helpers/users");
const { emitWheelStateTo } = require("../helpers/wheel");
const { emitTimerStateTo } = require("../helpers/timer");
const { emitPlaylistStateTo } = require("../helpers/playlists");
const { emitRoomStateToSocket, restoreRoomStateFromDB } = require("../helpers/sync");
const { emitChatHistoryToSocket } = require("../helpers/chat");
const { emitActivityHistory } = require("../helpers/activity");
const { emitGameStateTo } = require("../helpers/game");
const {
  emitCupGameStateTo,
  ensurePlayer: ensureCupGamePlayer,
} = require("../helpers/cupGame");

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

    // Restore persisted state if in-memory is cold (server restart recovery).
    await restoreRoomStateFromDB(deps, state, roomId);

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
        emitTimerStateTo(state, socket, roomId);
        await emitPlaylistStateTo(deps, state, socket, roomId);

        // Always re-send room state so reconnecting clients can re-sync.
        emitRoomStateToSocket(state, socket, roomId);

        const roomNameOnRejoin = state.roomName.get(roomId);
        if (roomNameOnRejoin) {
          socket.emit("room_name_changed", { roomId, name: roomNameOnRejoin });
        }

        // Ensure this socket is in participants for any active games
        // (handles reconnection / late-join scenarios).
        const gamesOnRejoin = state.roomGames.get(roomId);
        if (gamesOnRejoin) {
          for (const game of gamesOnRejoin.values()) {
            if (
              game.session.status === "active" &&
              !game.session.participants.includes(socket.id)
            ) {
              game.session.participants.push(socket.id);
            }
          }
        }

        emitGameStateTo(state, socket, roomId);

        // Likewise for cup-spider games — late joiners enter as spectators
        // mid-session, but get a fresh seat in any pre-start lobby.
        const cupGamesOnRejoin = state.roomCupGames.get(roomId);
        if (cupGamesOnRejoin) {
          const username = state.socketIdToUsername.get(socket.id) || null;
          for (const game of cupGamesOnRejoin.values()) {
            ensureCupGamePlayer(game, socket.id, username);
          }
        }
        emitCupGameStateTo(state, socket, roomId);
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
      emitTimerStateTo(state, socket, roomId);
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

    // Send room name if one has been set.
    const roomName = state.roomName.get(roomId);
    if (roomName) {
      socket.emit("room_name_changed", { roomId, name: roomName });
    }

    // Ensure this socket is in participants for any active games (late-join fix).
    const gamesOnJoin = state.roomGames.get(roomId);
    if (gamesOnJoin) {
      for (const game of gamesOnJoin.values()) {
        if (
          game.session.status === "active" &&
          !game.session.participants.includes(socket.id)
        ) {
          game.session.participants.push(socket.id);
        }
      }
    }

    emitGameStateTo(state, socket, roomId);

    // Same treatment for cup-spider games on a fresh join.
    const cupGamesOnJoin = state.roomCupGames.get(roomId);
    if (cupGamesOnJoin) {
      const username = state.socketIdToUsername.get(socket.id) || null;
      for (const game of cupGamesOnJoin.values()) {
        ensureCupGamePlayer(game, socket.id, username);
      }
    }
    emitCupGameStateTo(state, socket, roomId);

    // Send recent chat history for this room.
    await emitChatHistoryToSocket(deps, state, socket, roomId);

    await emitActivityHistory(deps, state, socket, roomId);
  });
}

module.exports = {
  attachJoinRoomHandler,
};
