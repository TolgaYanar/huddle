// Socket.IO always keeps every socket in a room named after its own id, so
// both membership styles used in this codebase are trivially true when a client
// passes a socket id as the roomId:
//
//   socket.rooms.has(socket.id)                          -> true
//   io.sockets.adapter.rooms.get(socket.id).has(socket.id) -> true
//
// That let a socket that joined nothing pass every per-room gate and write
// state into a pseudo-room that leave/disconnect cleanup never visits (those
// iterate `joinedRooms`, which never holds `socket.id`).
//
// Every membership check in the socket layer must go through one of these.

// Checks the socket's own room set. Use when you are gating the caller.
function isRoomMember(socket, roomId) {
  if (!socket || typeof roomId !== "string" || !roomId) return false;
  if (roomId === socket.id) return false;
  return Boolean(socket.rooms && socket.rooms.has(roomId));
}

// Checks the adapter. Use when you must gate a socket id other than the
// caller's (e.g. the WebRTC relay target), or when only `io` is in scope.
function isSocketIdInRoom(io, roomId, socketId) {
  if (typeof roomId !== "string" || !roomId) return false;
  if (typeof socketId !== "string" || !socketId) return false;
  // A socket is always in its own id-named room; that is not a real room.
  if (roomId === socketId) return false;
  try {
    const room = io?.sockets?.adapter?.rooms?.get(roomId);
    return room ? room.has(socketId) : false;
  } catch {
    return false;
  }
}

module.exports = {
  isRoomMember,
  isSocketIdInRoom,
};
