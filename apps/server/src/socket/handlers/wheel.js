const {
  getRoomWheel,
  emitWheelStateTo,
  emitWheelStateToRoom,
} = require("../helpers/wheel");

function attachWheelHandlers(io, state, socket) {
  // --- Wheel picker (shared random picker) ---
  socket.on("wheel_get", (data) => {
    const { roomId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    emitWheelStateTo(state, socket, roomId);
  });

  socket.on("wheel_add_entry", (data) => {
    const { roomId, text } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    const raw = typeof text === "string" ? text : "";
    const cleaned = raw.trim().slice(0, 200);
    if (!cleaned) return;

    const wheel = getRoomWheel(state, roomId);
    if (wheel.entries.length >= 1000) return;
    wheel.entries.push(cleaned);
    emitWheelStateToRoom(io, state, roomId);
  });

  socket.on("wheel_remove_entry", (data) => {
    const { roomId, index } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    const i = typeof index === "number" ? index : Number(index);
    if (!Number.isFinite(i)) return;

    const wheel = getRoomWheel(state, roomId);
    const idx = Math.floor(i);
    if (idx < 0 || idx >= wheel.entries.length) return;
    wheel.entries.splice(idx, 1);
    emitWheelStateToRoom(io, state, roomId);
  });

  socket.on("wheel_clear", (data) => {
    const { roomId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    const wheel = getRoomWheel(state, roomId);
    wheel.entries = [];
    wheel.lastSpin = undefined;
    emitWheelStateToRoom(io, state, roomId);
  });

  socket.on("wheel_spin", (data) => {
    const { roomId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    const wheel = getRoomWheel(state, roomId);
    const entryCount = wheel.entries.length;
    if (entryCount <= 0) return;

    const index = Math.floor(Math.random() * entryCount);
    const result = wheel.entries[index];
    const spunAt = Date.now();

    wheel.lastSpin = {
      index,
      result,
      entryCount,
      spunAt,
      senderId: socket.id,
    };

    io.to(roomId).emit("wheel_spun", {
      roomId,
      index,
      result,
      entryCount,
      spunAt,
      senderId: socket.id,
      entries: wheel.entries,
    });

    emitWheelStateToRoom(io, state, roomId);
  });
}

module.exports = {
  attachWheelHandlers,
};
