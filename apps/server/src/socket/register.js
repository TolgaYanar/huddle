const { createSocketState } = require("./state");
const { attachSocketAuth } = require("./attachAuth");

const { attachJoinRoomHandler } = require("./handlers/joinRoom");
const { attachLeaveRoomHandler } = require("./handlers/leaveRoom");
const { attachWheelHandlers } = require("./handlers/wheel");
const { attachPlaylistCrudHandlers } = require("./handlers/playlistCrud");
const { attachPlaylistItemHandlers } = require("./handlers/playlistItems");
const {
  attachPlaylistPlaybackHandlers,
} = require("./handlers/playlistPlayback");
const { attachModerationHandlers } = require("./handlers/moderation");
const { attachWebRTCHandlers } = require("./handlers/webrtc");
const { attachChatHandlers } = require("./handlers/chat");
const { attachActivityHandlers } = require("./handlers/activity");
const { attachSyncHandlers } = require("./handlers/syncVideo");
const { attachDisconnectHandler } = require("./handlers/disconnect");

function registerSocket(io, deps) {
  const state = createSocketState();

  // expose state for potential future debugging
  deps.socketState = state;

  attachSocketAuth(io, state, deps);

  const isSocketInRoom = (roomId, socketId) => {
    try {
      const room = io.sockets.adapter.rooms.get(roomId);
      return room ? room.has(socketId) : false;
    } catch {
      return false;
    }
  };

  io.on("connection", (socket) => {
    if (typeof deps.vLog === "function")
      deps.vLog("User connected:", socket.id);

    const joinedRooms = new Set();

    attachJoinRoomHandler(io, state, socket, joinedRooms, deps);
    attachLeaveRoomHandler(io, state, socket, joinedRooms, deps);

    attachWheelHandlers(io, state, socket);

    attachPlaylistCrudHandlers(io, state, socket, deps);
    attachPlaylistItemHandlers(io, state, socket, deps);
    attachPlaylistPlaybackHandlers(io, state, socket, deps);

    attachModerationHandlers(io, state, socket, deps);

    attachWebRTCHandlers(io, state, socket, deps);

    attachChatHandlers(io, state, socket, deps, isSocketInRoom);
    attachActivityHandlers(state, socket, deps);

    attachSyncHandlers(io, state, socket, deps);

    attachDisconnectHandler(io, state, socket, joinedRooms, deps);
  });

  return state;
}

module.exports = {
  registerSocket,
};
