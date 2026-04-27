const { normalizeRoomId } = require("../helpers/chat");
const { emitActivityHistory } = require("../helpers/activity");

function attachActivityHandlers(state, socket, deps) {
  socket.on("request_activity_history", async (rawRoom) => {
    const roomId = normalizeRoomId(rawRoom);
    if (!roomId) return;
    // No strict membership check: clients can emit this right after
    // join_room which awaits a DB load. A strict guard would race.
    await emitActivityHistory(deps, state, socket, roomId);
  });
}

module.exports = {
  attachActivityHandlers,
};
