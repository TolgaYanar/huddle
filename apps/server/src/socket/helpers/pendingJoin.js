function getJoinBag(socket) {
  const bag = (socket.data ||= {});
  bag.roomJoinSequence ||= 0;
  bag.activeRoomJoins ||= new Map();
  bag.pendingJoins ||= new Map();
  return bag;
}

function beginPendingRoomJoin(socket, roomId) {
  const bag = getJoinBag(socket);
  const token = ++bag.roomJoinSequence;
  bag.activeRoomJoins.set(roomId, token);
  return token;
}

function isPendingRoomJoinCurrent(socket, roomId, token) {
  const bag = socket.data;
  return (
    socket.connected !== false &&
    bag?.activeRoomJoins instanceof Map &&
    bag.activeRoomJoins.get(roomId) === token
  );
}

function finishPendingRoomJoin(socket, roomId, token) {
  const bag = socket.data;
  if (
    bag?.activeRoomJoins instanceof Map &&
    bag.activeRoomJoins.get(roomId) === token
  ) {
    bag.activeRoomJoins.delete(roomId);
  }
}

function cancelPendingRoomJoin(socket, roomId) {
  const bag = getJoinBag(socket);
  bag.activeRoomJoins.delete(roomId);
  bag.pendingJoins.delete(roomId);
}

function cancelAllPendingRoomJoins(socket) {
  const bag = getJoinBag(socket);
  bag.activeRoomJoins.clear();
  bag.pendingJoins.clear();
}

module.exports = {
  beginPendingRoomJoin,
  isPendingRoomJoinCurrent,
  finishPendingRoomJoin,
  cancelPendingRoomJoin,
  cancelAllPendingRoomJoins,
};
