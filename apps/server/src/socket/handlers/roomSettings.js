const { persistRoomState } = require("../helpers/sync");

const MAX_ROOM_NAME_LENGTH = 40;

function attachRoomSettingsHandlers(io, state, socket, deps) {
  // Host-only: set or clear the room display name.
  socket.on("set_room_name", async (data) => {
    const { roomId, name } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (state.roomHost.get(roomId) !== socket.id) return;

    const trimmed =
      typeof name === "string" ? name.trim().slice(0, MAX_ROOM_NAME_LENGTH) : "";

    if (trimmed) {
      state.roomName.set(roomId, trimmed);
    } else {
      state.roomName.delete(roomId);
    }

    io.to(roomId).emit("room_name_changed", {
      roomId,
      name: trimmed || null,
    });

    persistRoomState(deps, state, roomId);
  });
}

module.exports = { attachRoomSettingsHandlers };
