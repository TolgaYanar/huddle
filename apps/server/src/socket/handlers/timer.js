const {
  getRoomTimer,
  emitTimerStateTo,
  emitTimerStateToRoom,
  MAX_DURATION_MS,
} = require("../helpers/timer");

function attachTimerHandlers(io, state, socket) {
  socket.on("timer_get", (data) => {
    const { roomId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    emitTimerStateTo(state, socket, roomId);
  });

  socket.on("timer_set_duration", (data) => {
    const { roomId, durationMs } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    const ms = typeof durationMs === "number" ? Math.floor(durationMs) : 0;
    if (ms <= 0 || ms > MAX_DURATION_MS) return;

    const timer = getRoomTimer(state, roomId);
    timer.durationMs = ms;
    timer.remainingMs = ms;
    timer.endsAt = null;
    timer.status = "idle";
    emitTimerStateToRoom(io, state, roomId);
  });

  socket.on("timer_start", (data) => {
    const { roomId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    const timer = getRoomTimer(state, roomId);
    if (timer.status === "running") return;
    if (timer.remainingMs <= 0) return;

    const now = Date.now();
    timer.endsAt = now + timer.remainingMs;
    timer.status = "running";
    emitTimerStateToRoom(io, state, roomId);
  });

  socket.on("timer_pause", (data) => {
    const { roomId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    const timer = getRoomTimer(state, roomId);
    if (timer.status !== "running") return;

    const now = Date.now();
    timer.remainingMs = Math.max(0, timer.endsAt - now);
    timer.endsAt = null;
    timer.status = "paused";
    emitTimerStateToRoom(io, state, roomId);
  });

  socket.on("timer_reset", (data) => {
    const { roomId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    const timer = getRoomTimer(state, roomId);
    timer.remainingMs = timer.durationMs;
    timer.endsAt = null;
    timer.status = "idle";
    emitTimerStateToRoom(io, state, roomId);
  });
}

module.exports = { attachTimerHandlers };
