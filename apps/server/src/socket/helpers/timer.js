const DEFAULT_DURATION_MS = 25 * 60 * 1000; // 25 minutes
const MAX_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours cap

// A running timer whose end has passed is finished. Without this the status
// stayed "running" forever: clients showed Pause instead of "Time's up", and
// timer_start was a no-op until someone pressed reset.
function settleTimer(timer, now = Date.now()) {
  if (
    timer.status === "running" &&
    timer.endsAt !== null &&
    timer.endsAt <= now
  ) {
    timer.status = "finished";
    timer.remainingMs = 0;
    timer.endsAt = null;
  }
  return timer;
}

function getRoomTimer(state, roomId) {
  const existing = state.roomTimer.get(roomId);
  if (existing) return settleTimer(existing);
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

function clearTimerFinish(timer) {
  if (timer.finishHandle) {
    clearTimeout(timer.finishHandle);
    timer.finishHandle = null;
  }
}

// Broadcasts "finished" when a running timer reaches zero, so the room sees it
// without anyone acting. Unref'ed so it never holds the process open, and it
// only acts on the same timer object: if the room was cleaned up meanwhile,
// touching it through getRoomTimer would recreate the entry.
function scheduleTimerFinish(io, state, roomId, timer) {
  clearTimerFinish(timer);
  if (timer.status !== "running" || timer.endsAt === null) return;
  const handle = setTimeout(
    () => {
      timer.finishHandle = null;
      if (state.roomTimer.get(roomId) !== timer) return;
      settleTimer(timer);
      if (timer.status === "finished") emitTimerStateToRoom(io, state, roomId);
    },
    Math.max(0, timer.endsAt - Date.now()),
  );
  if (typeof handle.unref === "function") handle.unref();
  timer.finishHandle = handle;
}

module.exports = {
  settleTimer,
  scheduleTimerFinish,
  clearTimerFinish,
  getRoomTimer,
  buildTimerPayload,
  emitTimerStateTo,
  emitTimerStateToRoom,
  MAX_DURATION_MS,
};
