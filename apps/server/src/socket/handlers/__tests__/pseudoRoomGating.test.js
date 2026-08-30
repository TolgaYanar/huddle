const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createSocketState } = require("../../state");
const { attachChatHandlers } = require("../chat");
const { attachWebRTCHandlers } = require("../webrtc");
const { isSocketIdInRoom } = require("../../helpers/membership");
const { ensureRoomHost } = require("../../helpers/users");

function createFakeIo() {
  const io = {
    sockets: { adapter: { rooms: new Map() }, sockets: new Map() },
    relayed: [],
    to(target) {
      return {
        emit(event, payload) {
          io.relayed.push({ target, event, payload });
        },
      };
    },
  };
  return io;
}

function createFakeSocket(io, id) {
  const socket = {
    id,
    rooms: new Set([id]),
    data: {},
    handlers: new Map(),
    emitted: [],
    on(event, fn) {
      socket.handlers.set(event, fn);
    },
    emit(event, payload) {
      socket.emitted.push({ event, payload });
    },
    join(roomId) {
      socket.rooms.add(roomId);
      let room = io.sockets.adapter.rooms.get(roomId);
      if (!room) {
        room = new Set();
        io.sockets.adapter.rooms.set(roomId, room);
      }
      room.add(socket.id);
    },
    to() {
      return { emit() {} };
    },
  };
  io.sockets.sockets.set(id, socket);
  // Mirror socket.io: the adapter also holds a room named after the socket id.
  io.sockets.adapter.rooms.set(id, new Set([id]));
  return socket;
}

// register.js hands this exact wrapper to the chat handlers.
const adapterGate = (io) => (roomId, socketId) =>
  isSocketIdInRoom(io, roomId, socketId);

describe("pseudo-room gating (roomId === socket id)", () => {
  it("send_chat from a socket that joined nothing is dropped", async () => {
    const io = createFakeIo();
    const state = createSocketState();
    const socket = createFakeSocket(io, "sock-1");

    let persisted = 0;
    const deps = {
      isDbConnected: () => false,
      getPrisma: () => null,
      vLog: undefined,
    };
    attachChatHandlers(io, state, socket, deps, adapterGate(io));

    // The socket never joined a room; it addresses its own id-named room.
    await socket.handlers.get("send_chat")({
      roomId: socket.id,
      text: "pseudo-room write",
    });

    assert.equal(persisted, 0);
    assert.equal(
      state.roomChatHistory.has(socket.id),
      false,
      "no chat history written for the pseudo-room",
    );
    assert.equal(io.relayed.length, 0, "nothing broadcast");
  });

  it("send_chat into a genuinely joined room still works", async () => {
    const io = createFakeIo();
    const state = createSocketState();
    const socket = createFakeSocket(io, "sock-1");
    const deps = {
      isDbConnected: () => false,
      getPrisma: () => null,
      vLog: undefined,
    };
    attachChatHandlers(io, state, socket, deps, adapterGate(io));

    socket.join("movie-night");
    await socket.handlers.get("send_chat")({
      roomId: "movie-night",
      text: "hello",
    });

    assert.equal(
      state.roomChatHistory.has("movie-night"),
      true,
      "real room still accepts chat",
    );
  });

  it("webrtc_media_state from a socket that joined nothing is dropped", async () => {
    const io = createFakeIo();
    const state = createSocketState();
    const socket = createFakeSocket(io, "sock-1");
    attachWebRTCHandlers(io, state, socket, {
      isDbConnected: () => false,
      getPrisma: () => null,
    });

    await socket.handlers.get("webrtc_media_state")({
      roomId: socket.id,
      state: { mic: true, cam: true, screen: true },
    });

    assert.equal(
      state.roomMediaState.has(socket.id),
      false,
      "no media state written for the pseudo-room",
    );
  });

  it("webrtc_offer is not relayed through an id-named room", () => {
    const io = createFakeIo();
    const state = createSocketState();
    const socket = createFakeSocket(io, "sock-1");
    createFakeSocket(io, "sock-2");
    attachWebRTCHandlers(io, state, socket, {
      isDbConnected: () => false,
      getPrisma: () => null,
    });

    socket.handlers.get("webrtc_offer")({
      roomId: "sock-2",
      to: "sock-2",
      sdp: { type: "offer", sdp: "v=0" },
    });

    assert.equal(io.relayed.length, 0);
  });
});

describe("webrtc_ice payload validation", () => {
  function setup() {
    const io = createFakeIo();
    const state = createSocketState();
    const a = createFakeSocket(io, "sock-1");
    const b = createFakeSocket(io, "sock-2");
    attachWebRTCHandlers(io, state, a, {
      isDbConnected: () => false,
      getPrisma: () => null,
    });
    a.join("movie-night");
    b.join("movie-night");
    return { io, a };
  }

  it("relays a well-formed candidate", () => {
    const { io, a } = setup();
    a.handlers.get("webrtc_ice")({
      roomId: "movie-night",
      to: "sock-2",
      candidate: { candidate: "candidate:1 1 udp", sdpMLineIndex: 0 },
    });
    assert.equal(io.relayed.length, 1);
    assert.equal(io.relayed[0].event, "webrtc_ice");
  });

  it("drops an oversized candidate string", () => {
    const { io, a } = setup();
    a.handlers.get("webrtc_ice")({
      roomId: "movie-night",
      to: "sock-2",
      candidate: { candidate: "x".repeat(2000) },
    });
    assert.equal(io.relayed.length, 0);
  });

  it("drops a candidate that is not an object with a candidate string", () => {
    const { io, a } = setup();
    for (const bad of ["str", 42, {}, { candidate: 1 }, { sdpMid: "0" }]) {
      a.handlers.get("webrtc_ice")({
        roomId: "movie-night",
        to: "sock-2",
        candidate: bad,
      });
    }
    assert.equal(io.relayed.length, 0);
  });

  it("strips unknown keys from the relayed candidate", () => {
    const { io, a } = setup();
    a.handlers.get("webrtc_ice")({
      roomId: "movie-night",
      to: "sock-2",
      candidate: { candidate: "candidate:1", payload: "x".repeat(500) },
    });
    assert.equal(io.relayed.length, 1);
    assert.deepEqual(Object.keys(io.relayed[0].payload.candidate).sort(), [
      "candidate",
      "sdpMLineIndex",
      "sdpMid",
      "usernameFragment",
    ]);
  });
});

describe("host reassignment after the grace window", () => {
  it("promotes the rejoiner when the stored host socket is gone", () => {
    const io = createFakeIo();
    const state = createSocketState();

    // The original host left; leaveRoom/disconnect deliberately keep roomHost
    // through the empty-room grace window, so it points at a dead socket id.
    state.roomHost.set("movie-night", "sock-old");

    const rejoiner = createFakeSocket(io, "sock-new");
    rejoiner.join("movie-night");

    ensureRoomHost(io, state, "movie-night", rejoiner.id);

    assert.equal(state.roomHost.get("movie-night"), "sock-new");
    const emitted = io.relayed.filter((e) => e.event === "room_host");
    assert.equal(emitted.at(-1).payload.hostId, "sock-new");
  });

  it("keeps the existing host while that socket is still in the room", () => {
    const io = createFakeIo();
    const state = createSocketState();

    const host = createFakeSocket(io, "sock-host");
    host.join("movie-night");
    state.roomHost.set("movie-night", host.id);

    const joiner = createFakeSocket(io, "sock-2");
    joiner.join("movie-night");

    ensureRoomHost(io, state, "movie-night", joiner.id);

    assert.equal(state.roomHost.get("movie-night"), "sock-host");
  });

  it("sets the first joiner as host for a room with no host", () => {
    const io = createFakeIo();
    const state = createSocketState();
    const first = createFakeSocket(io, "sock-1");
    first.join("movie-night");

    ensureRoomHost(io, state, "movie-night", first.id);

    assert.equal(state.roomHost.get("movie-night"), "sock-1");
  });
});
