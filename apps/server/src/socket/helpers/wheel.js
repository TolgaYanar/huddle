function getRoomWheel(state, roomId) {
  const existing = state.roomWheel.get(roomId);
  if (existing && Array.isArray(existing.entries)) return existing;
  const created = { entries: [] };
  state.roomWheel.set(roomId, created);
  return created;
}

function emitWheelStateTo(state, socket, roomId) {
  const wheel = getRoomWheel(state, roomId);
  socket.emit("wheel_state", {
    roomId,
    entries: wheel.entries,
    lastSpin: wheel.lastSpin ?? null,
  });
}

function emitWheelStateToRoom(io, state, roomId) {
  const wheel = getRoomWheel(state, roomId);
  io.to(roomId).emit("wheel_state", {
    roomId,
    entries: wheel.entries,
    lastSpin: wheel.lastSpin ?? null,
  });
}

module.exports = {
  getRoomWheel,
  emitWheelStateTo,
  emitWheelStateToRoom,
};
