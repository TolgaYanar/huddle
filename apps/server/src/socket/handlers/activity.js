const { normalizeRoomId } = require("../helpers/chat");
const { emitActivityHistory } = require("../helpers/activity");

function attachActivityHandlers(state, socket, deps) {
  socket.on("request_activity_history", async (rawRoom) => {
    const roomId = normalizeRoomId(rawRoom);
    if (!roomId) return;
    await emitActivityHistory(deps, state, socket, roomId);
  });
}

module.exports = {
  attachActivityHandlers,
};
