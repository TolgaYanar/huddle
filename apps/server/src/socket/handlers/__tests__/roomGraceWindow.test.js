const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createSocketState, cleanupRoom } = require("../../state");
const { attachLeaveRoomHandler } = require("../leaveRoom");
const { attachDisconnectHandler } = require("../disconnect");

function createFakeIo() {
  return {
    sockets: { adapter: { rooms: new Map() }, sockets: new Map() },
    to() {
      return { emit() {} };
    },
  };
}

function createFakeSocket(io, id) {
  const socket = {
    id,
    rooms: new Set([id]),
    data: {},
    handlers: new Map(),
    on(event, fn) {
      socket.handlers.set(event, fn);
    },
    emit() {},
    join(roomId) {
      socket.rooms.add(roomId);
      let room = io.sockets.adapter.rooms.get(roomId);
      if (!room) {
        room = new Set();
        io.sockets.adapter.rooms.set(roomId, room);
      }
      room.add(socket.id);
    },
    leave(roomId) {
      socket.rooms.delete(roomId);
      io.sockets.adapter.rooms.get(roomId)?.delete(socket.id);
    },
    to() {
      return { emit() {} };
    },
  };
  io.sockets.sockets.set(id, socket);
  return socket;
}

const noopDeps = {
  isDbConnected: () => false,
  getPrisma: () => null,
  vLog: undefined,
};

// The room is emptied by the last member. scheduleRoomCleanup() defers freeing
// every per-room map by ROOM_EMPTY_GRACE_MS so a reconnect blip or a refresh
// does not lose the room. leaveRoom/disconnect used to eagerly delete the host,
// bans, password and wheel right here, which defeated that window: a kicked
// user could rejoin a password-protected room as host after a 3s blip.
function seedRoom(state, roomId, socketId) {
  state.roomHost.set(roomId, socketId);
  state.roomBans.set(roomId, new Set(["user:griefer"]));
  state.roomPasswordHash.set(roomId, "salt:hash");
  state.roomWheel.set(roomId, { entries: ["a", "b"] });
}

function assertRetained(state, roomId, via) {
  assert.equal(state.roomHost.has(roomId), true, `${via}: host retained`);
  assert.equal(state.roomBans.has(roomId), true, `${via}: bans retained`);
  assert.equal(
    state.roomPasswordHash.has(roomId),
    true,
    `${via}: password retained`,
  );
  assert.equal(state.roomWheel.has(roomId), true, `${via}: wheel retained`);
}

describe("empty-room grace window", () => {
  it("keeps host, bans, password and wheel when the last member leaves", () => {
    const io = createFakeIo();
    const state = createSocketState();
    const socket = createFakeSocket(io, "sock-1");
    const joinedRooms = new Set();

    attachLeaveRoomHandler(io, state, socket, joinedRooms, noopDeps);

    socket.join("movie-night");
    joinedRooms.add("movie-night");
    seedRoom(state, "movie-night", socket.id);

    socket.handlers.get("leave_room")({ roomId: "movie-night" });

    assertRetained(state, "movie-night", "leave_room");
    cleanupRoom(io, state, "movie-night");
  });

  it("keeps them when the last member disconnects", () => {
    const io = createFakeIo();
    const state = createSocketState();
    const socket = createFakeSocket(io, "sock-1");
    const joinedRooms = new Set();

    attachDisconnectHandler(io, state, socket, joinedRooms, noopDeps);

    socket.join("movie-night");
    joinedRooms.add("movie-night");
    seedRoom(state, "movie-night", socket.id);
    io.sockets.adapter.rooms.get("movie-night").delete(socket.id);

    socket.handlers.get("disconnect")();

    assertRetained(state, "movie-night", "disconnect");
    cleanupRoom(io, state, "movie-night");
  });

  it("cleanupRoom still frees all four once the grace window expires", () => {
    const io = createFakeIo();
    const state = createSocketState();
    seedRoom(state, "movie-night", "sock-1");

    cleanupRoom(io, state, "movie-night");

    assert.equal(state.roomHost.has("movie-night"), false);
    assert.equal(state.roomBans.has("movie-night"), false);
    assert.equal(state.roomPasswordHash.has("movie-night"), false);
    assert.equal(state.roomWheel.has("movie-night"), false);
  });
});
