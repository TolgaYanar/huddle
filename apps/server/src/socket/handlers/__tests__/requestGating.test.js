const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createSocketState } = require("../../state");
const { attachJoinRoomHandler } = require("../joinRoom");
const { attachChatHandlers } = require("../chat");
const { attachActivityHandlers } = require("../activity");
const { attachSyncHandlers } = require("../syncVideo");

function createFakeIo() {
  return {
    sockets: {
      adapter: { rooms: new Map() },
      sockets: new Map(),
    },
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
  return socket;
}

function createHarness() {
  const io = createFakeIo();
  const state = createSocketState();
  const socket = createFakeSocket(io, "socket-1");
  const deps = {
    isDbConnected: () => false,
    getPrisma: () => null,
    verifyPassword: (pw, hash) => pw === hash,
    vLog: undefined,
  };
  const isSocketInRoom = (roomId, socketId) => {
    const room = io.sockets.adapter.rooms.get(roomId);
    return room ? room.has(socketId) : false;
  };

  attachJoinRoomHandler(io, state, socket, new Set(), deps);
  attachChatHandlers(io, state, socket, deps, isSocketInRoom);
  attachActivityHandlers(state, socket, deps);
  attachSyncHandlers(io, state, socket, deps);

  return { io, state, socket };
}

function emittedEvents(socket, event) {
  return socket.emitted.filter((e) => e.event === event);
}

function seedRoomData(state, roomId) {
  state.roomChatHistory.set(roomId, [
    {
      id: "m1",
      roomId,
      senderId: "someone-else",
      senderUsername: "alice",
      text: "secret message",
      createdAt: new Date(),
    },
  ]);
  state.roomState.set(roomId, {
    videoUrl: "https://youtube.com/watch?v=abc",
    timestamp: 42,
    isPlaying: false,
    updatedAt: Date.now(),
    rev: 3,
  });
}

describe("room data request gating", () => {
  it("drops chat/activity/room-state requests from non-members", async () => {
    const { state, socket } = createHarness();
    seedRoomData(state, "room1");

    await socket.handlers.get("request_chat_history")("room1");
    await socket.handlers.get("request_activity_history")("room1");
    await socket.handlers.get("request_room_state")("room1");

    assert.equal(emittedEvents(socket, "chat_history").length, 0);
    assert.equal(emittedEvents(socket, "activity_history").length, 0);
    assert.equal(emittedEvents(socket, "room_state").length, 0);
  });

  it("serves chat/activity/room-state requests to members", async () => {
    const { state, socket } = createHarness();
    seedRoomData(state, "room1");

    socket.handlers.get("join_room")("room1");
    await socket.data.pendingJoins.get("room1");
    socket.emitted.length = 0;

    await socket.handlers.get("request_chat_history")("room1");
    await socket.handlers.get("request_activity_history")("room1");
    await socket.handlers.get("request_room_state")("room1");

    const chat = emittedEvents(socket, "chat_history");
    assert.equal(chat.length, 1);
    assert.equal(chat[0].payload.messages[0].text, "secret message");

    // Without a DB the activity helper still answers, just with no events.
    const activity = emittedEvents(socket, "activity_history");
    assert.equal(activity.length, 1);
    assert.deepEqual(activity[0].payload.events, []);

    const roomState = emittedEvents(socket, "room_state");
    assert.equal(roomState.length, 1);
    assert.equal(roomState[0].payload.videoUrl, "https://youtube.com/watch?v=abc");
    assert.equal(roomState[0].payload.rev, 3);
  });

  it("serves requests racing an in-flight join (no await between join and request)", async () => {
    const { state, socket } = createHarness();
    seedRoomData(state, "room2");

    // Mimic real clients: join_room then the requests back-to-back on the
    // same connection, without waiting for the join to finish. A naive
    // socket.rooms.has() guard would drop these.
    socket.handlers.get("join_room")("room2");
    const chatPromise = socket.handlers.get("request_chat_history")("room2");
    const statePromise = socket.handlers.get("request_room_state")("room2");
    await Promise.all([chatPromise, statePromise]);

    const chat = emittedEvents(socket, "chat_history");
    assert.equal(chat.length, 2); // one from join_room itself, one from the request
    assert.equal(chat[1].payload.messages[0].text, "secret message");

    const roomState = emittedEvents(socket, "room_state");
    assert.ok(roomState.length >= 2);
    assert.equal(roomState[roomState.length - 1].payload.rev, 3);
  });

  it("drops requests after a failed password join", async () => {
    const { state, socket } = createHarness();
    seedRoomData(state, "room3");
    state.roomPasswordHash.set("room3", "hunter2");

    socket.handlers.get("join_room")({ roomId: "room3" });
    await socket.data.pendingJoins.get("room3");

    assert.equal(emittedEvents(socket, "room_requires_password").length, 1);
    assert.equal(socket.rooms.has("room3"), false);
    socket.emitted.length = 0;

    await socket.handlers.get("request_room_state")("room3");
    await socket.handlers.get("request_chat_history")("room3");

    assert.equal(emittedEvents(socket, "room_state").length, 0);
    assert.equal(emittedEvents(socket, "chat_history").length, 0);
  });
});
