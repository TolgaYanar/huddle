const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { isRoomMember, isSocketIdInRoom } = require("../membership");

function fakeSocket(id, joined = []) {
  return { id, rooms: new Set([id, ...joined]) };
}

describe("isRoomMember", () => {
  it("accepts a room the socket actually joined", () => {
    const socket = fakeSocket("sock-1", ["movie-night"]);
    assert.equal(isRoomMember(socket, "movie-night"), true);
  });

  it("rejects a room the socket never joined", () => {
    const socket = fakeSocket("sock-1", ["movie-night"]);
    assert.equal(isRoomMember(socket, "other-room"), false);
  });

  it("rejects the socket's own id used as a roomId", () => {
    // Socket.IO always keeps every socket in a room named after its own id, so
    // a raw `socket.rooms.has(roomId)` check passes for roomId === socket.id.
    // That let a socket that joined nothing write per-room state into a
    // pseudo-room that leave/disconnect cleanup never visits.
    const socket = fakeSocket("sock-1");
    assert.equal(socket.rooms.has("sock-1"), true, "precondition");
    assert.equal(isRoomMember(socket, "sock-1"), false);
  });

  it("rejects the own-id case even when other rooms are joined", () => {
    const socket = fakeSocket("sock-1", ["movie-night"]);
    assert.equal(isRoomMember(socket, "sock-1"), false);
  });

  it("rejects non-string and empty room ids", () => {
    const socket = fakeSocket("sock-1", ["movie-night"]);
    for (const bad of [undefined, null, "", 0, 42, {}, []]) {
      assert.equal(isRoomMember(socket, bad), false, String(bad));
    }
  });

  it("rejects a missing socket or a socket with no rooms", () => {
    assert.equal(isRoomMember(null, "movie-night"), false);
    assert.equal(isRoomMember({ id: "sock-1" }, "movie-night"), false);
  });
});

function fakeIo(rooms = {}) {
  const map = new Map();
  for (const [roomId, members] of Object.entries(rooms)) {
    map.set(roomId, new Set(members));
  }
  return { sockets: { adapter: { rooms: map } } };
}

describe("isSocketIdInRoom", () => {
  it("accepts a socket that is in the adapter room", () => {
    const io = fakeIo({ "movie-night": ["sock-1", "sock-2"] });
    assert.equal(isSocketIdInRoom(io, "movie-night", "sock-2"), true);
  });

  it("rejects a socket that is not in the room", () => {
    const io = fakeIo({ "movie-night": ["sock-1"] });
    assert.equal(isSocketIdInRoom(io, "movie-night", "sock-2"), false);
  });

  it("rejects a socket id used as a roomId", () => {
    // Socket.IO's adapter also holds a room named after each socket id. The
    // chat and WebRTC gates used a raw adapter lookup, so a socket that had
    // joined nothing could pass them by sending its own id as roomId.
    const io = fakeIo({ "sock-1": ["sock-1"] });
    assert.equal(
      io.sockets.adapter.rooms.get("sock-1").has("sock-1"),
      true,
      "precondition",
    );
    assert.equal(isSocketIdInRoom(io, "sock-1", "sock-1"), false);
  });

  it("rejects a relay target addressed through its own id-named room", () => {
    const io = fakeIo({ "sock-2": ["sock-2"] });
    assert.equal(isSocketIdInRoom(io, "sock-2", "sock-2"), false);
  });

  it("rejects unknown rooms and bad arguments", () => {
    const io = fakeIo({ "movie-night": ["sock-1"] });
    assert.equal(isSocketIdInRoom(io, "nope", "sock-1"), false);
    assert.equal(isSocketIdInRoom(io, "", "sock-1"), false);
    assert.equal(isSocketIdInRoom(io, "movie-night", ""), false);
    assert.equal(isSocketIdInRoom(io, "movie-night", 42), false);
    assert.equal(isSocketIdInRoom(undefined, "movie-night", "sock-1"), false);
  });
});
