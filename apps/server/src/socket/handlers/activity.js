const { normalizeRoomId } = require("../helpers/chat");
const { emitActivityHistory } = require("../helpers/activity");

function attachActivityHandlers(state, socket, deps) {
  socket.on("request_activity_history", async (rawRoom) => {
    const roomId = normalizeRoomId(rawRoom);
    if (!roomId) return;
    // Clients emit this right after join_room, whose handler awaits a DB
    // load before socket.join(). Await any in-flight join for this room,
    // then gate on membership so non-members can't read the activity feed.
    const pending = socket.data?.pendingJoins?.get(roomId);
    if (pending) await pending.catch(() => {});
    if (!socket.rooms.has(roomId)) return;
    await emitActivityHistory(deps, state, socket, roomId);
  });
}

module.exports = {
  attachActivityHandlers,
};
