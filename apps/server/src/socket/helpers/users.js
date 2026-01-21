function ensureRoomHost(io, state, roomId, fallbackHostSocketId) {
  if (!state.roomHost.has(roomId) && fallbackHostSocketId) {
    state.roomHost.set(roomId, fallbackHostSocketId);
  }

  io.to(roomId).emit("room_host", {
    roomId,
    hostId: state.roomHost.get(roomId) || null,
  });
}

function getRoomUsersSnapshot(io, state, roomId) {
  const room = io.sockets.adapter.rooms.get(roomId);
  const users = room ? Array.from(room) : [];

  const usernames = {};
  for (const id of users) {
    usernames[id] = state.socketIdToUsername.get(id) || null;
  }

  const stateMap = state.roomMediaState.get(roomId);
  const mediaStates = {};
  if (stateMap) {
    for (const [sid, st] of stateMap.entries()) {
      mediaStates[sid] = st;
    }
  }

  return {
    roomId,
    users,
    usernames,
    mediaStates,
    hostId: state.roomHost.get(roomId) || null,
  };
}

function emitRoomUsersToRoom(io, state, roomId) {
  io.to(roomId).emit("room_users", getRoomUsersSnapshot(io, state, roomId));
}

function emitRoomUsersSnapshotToSocket(io, state, socket, roomId) {
  const room = io.sockets.adapter.rooms.get(roomId);
  const users = room ? Array.from(room).filter((id) => id !== socket.id) : [];

  const usernames = {};
  for (const id of users) {
    usernames[id] = state.socketIdToUsername.get(id) || null;
  }

  const stateMap = state.roomMediaState.get(roomId);
  const mediaStates = {};
  if (stateMap) {
    for (const [sid, st] of stateMap.entries()) {
      if (sid === socket.id) continue;
      mediaStates[sid] = st;
    }
  }

  socket.emit("room_users", {
    roomId,
    users,
    usernames,
    mediaStates,
    hostId: state.roomHost.get(roomId) || null,
  });
}

module.exports = {
  ensureRoomHost,
  getRoomUsersSnapshot,
  emitRoomUsersToRoom,
  emitRoomUsersSnapshotToSocket,
};
