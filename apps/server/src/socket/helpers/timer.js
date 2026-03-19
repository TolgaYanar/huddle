const DEFAULT_DURATION_MS = 25 * 60 * 1000; // 25 minutes
const MAX_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours cap

function getRoomTimer(state, roomId) {
  const existing = state.roomTimer.get(roomId);
  if (existing) return existing;
  const created = {
    durationMs: DEFAULT_DURATION_MS,
    remainingMs: DEFAULT_DURATION_MS,
    endsAt: null,
    status: "idle", // idle | running | paused | finished
  };
  state.roomTimer.set(roomId, created);
  return created;
}

function buildTimerPayload(roomId, timer) {
  return {
    roomId,
    status: timer.status,
    durationMs: timer.durationMs,
    remainingMs: timer.remainingMs,
    endsAt: timer.endsAt,
    serverNow: Date.now(),
  };
}

function emitTimerStateTo(state, socket, roomId) {
  const timer = getRoomTimer(state, roomId);
  socket.emit("timer_state", buildTimerPayload(roomId, timer));
}

function emitTimerStateToRoom(io, state, roomId) {
  const timer = getRoomTimer(state, roomId);
  io.to(roomId).emit("timer_state", buildTimerPayload(roomId, timer));
}

module.exports = {
  getRoomTimer,
  buildTimerPayload,
  emitTimerStateTo,
  emitTimerStateToRoom,
  MAX_DURATION_MS,
};
