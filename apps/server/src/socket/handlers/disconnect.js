const { emitRoomUsersToRoom } = require("../helpers/users");
const { cleanupDisconnectFromGames } = require("../helpers/gameTimer");
const { cleanupDisconnectFromCupGames } = require("../helpers/cupGame");

function attachDisconnectHandler(io, state, socket, joinedRooms, deps) {
  socket.on("disconnect", () => {
    if (typeof deps.vLog === "function")
      deps.vLog("User disconnected:", socket.id);

    const username =
      socket.data?.authUser?.username ||
      state.socketIdToUsername.get(socket.id) ||
      null;

    const rooms = Array.from(joinedRooms);
    if (rooms.length === 0) {
      state.socketIdToUsername.delete(socket.id);
      return;
    }

    for (const roomId of rooms) {
      const map = state.roomMediaState.get(roomId);
      if (map) {
        map.delete(socket.id);
        if (map.size === 0) state.roomMediaState.delete(roomId);
      }

      // Drop the socket from any active games and rotate the turn if needed.
      try {
        cleanupDisconnectFromGames(io, state, roomId, socket.id);
      } catch (err) {
        console.error("Failed to clean up games on disconnect:", err.message);
      }
      try {
        cleanupDisconnectFromCupGames(io, state, roomId, socket.id);
      } catch (err) {
        console.error("Failed to clean up cup games on disconnect:", err.message);
      }

      socket.to(roomId).emit("user_left", { socketId: socket.id, username });
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

      if (state.roomHost.get(roomId) === socket.id) {
        const room = io.sockets.adapter.rooms.get(roomId);
        const remaining = room
          ? Array.from(room).filter((id) => id !== socket.id)
          : [];

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

      emitRoomUsersToRoom(io, state, roomId);
    }

    state.socketIdToUsername.delete(socket.id);

    (async () => {
      for (const roomId of rooms) {
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
          console.error("Failed to persist leave activity:", err.message);
        }
      }
    })();
  });
}

module.exports = {
  attachDisconnectHandler,
};
