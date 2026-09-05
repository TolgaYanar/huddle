const test = require("node:test");
const assert = require("node:assert/strict");

const {
  emitRoomUsersSnapshotToSocket,
  emitRoomUsersToRoom,
} = require("../users");

function harness() {
  const roomId = "movie-night";
  const socket = {
    id: "joiner",
    data: {},
    emitted: [],
    emit(event, payload) {
      this.emitted.push({ event, payload });
    },
  };
  const broadcasts = [];
  const io = {
    sockets: {
      adapter: {
        rooms: new Map([[roomId, new Set([socket.id, "peer"])]]),
      },
    },
    to(target) {
      assert.equal(target, roomId);
      return {
        emit(event, payload) {
          broadcasts.push({ event, payload });
        },
      };
    },
  };
  const state = {
    socketIdToUsername: new Map(),
    roomMediaState: new Map(),
    roomHost: new Map(),
  };
  return { broadcasts, io, roomId, socket, state };
}

test("private room snapshot issues a stable room capability without broadcasting it", () => {
  const { broadcasts, io, roomId, socket, state } = harness();

  emitRoomUsersSnapshotToSocket(io, state, socket, roomId);
  const first = socket.emitted.at(-1).payload.iceAccessToken;
  assert.match(first, /^[A-Za-z0-9_-]{40,}$/);

  emitRoomUsersSnapshotToSocket(io, state, socket, roomId);
  assert.equal(socket.emitted.at(-1).payload.iceAccessToken, first);

  emitRoomUsersToRoom(io, state, roomId);
  assert.equal(
    Object.hasOwn(broadcasts.at(-1).payload, "iceAccessToken"),
    false,
  );
});

test("room capability storage handles valid object-prototype room names", () => {
  const { io, socket, state } = harness();
  const roomId = "__proto__";
  io.sockets.adapter.rooms.set(roomId, new Set([socket.id]));

  emitRoomUsersSnapshotToSocket(io, state, socket, roomId);
  const token = socket.emitted.at(-1).payload.iceAccessToken;

  assert.match(token, /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(socket.data.iceAccessByRoom.get(roomId), token);
});
