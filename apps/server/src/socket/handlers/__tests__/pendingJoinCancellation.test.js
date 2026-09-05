const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { cleanupRoom, createSocketState } = require("../../state");
const { attachDisconnectHandler } = require("../disconnect");
const { attachJoinRoomHandler } = require("../joinRoom");
const { attachLeaveRoomHandler } = require("../leaveRoom");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function createHarness({
  activityCreate,
  activityFindMany,
  messageFindMany,
  playlistFindMany,
  verifyPassword,
} = {}) {
  const io = {
    sockets: { adapter: { rooms: new Map() }, sockets: new Map() },
    to: () => ({ emit() {} }),
  };
  const socket = {
    id: "joining-socket",
    connected: true,
    rooms: new Set(["joining-socket"]),
    data: {},
    handlers: new Map(),
    emitted: [],
    on(event, handler) {
      this.handlers.set(event, handler);
    },
    emit(event, payload) {
      this.emitted.push({ event, payload });
    },
    to: () => ({ emit() {} }),
    join(roomId) {
      this.rooms.add(roomId);
      const members = io.sockets.adapter.rooms.get(roomId) ?? new Set();
      members.add(this.id);
      io.sockets.adapter.rooms.set(roomId, members);
    },
    leave(roomId) {
      this.rooms.delete(roomId);
      io.sockets.adapter.rooms.get(roomId)?.delete(this.id);
    },
  };
  io.sockets.sockets.set(socket.id, socket);

  const lookup = deferred();
  const prisma = {
    roomState: { findUnique: () => lookup.promise },
    roomPlaylist: { findMany: playlistFindMany ?? (async () => []) },
    roomMessage: { findMany: messageFindMany ?? (async () => []) },
    roomActivity: {
      create:
        activityCreate ??
        (async ({ data }) => ({
          id: "activity-1",
          ...data,
          action: null,
          timestamp: null,
          videoUrl: null,
          createdAt: new Date(),
        })),
      findMany: activityFindMany ?? (async () => []),
    },
  };
  const deps = {
    isDbConnected: () => true,
    getPrisma: () => prisma,
    verifyPassword: verifyPassword ?? (async () => true),
  };
  const state = createSocketState();
  const joinedRooms = new Set();
  attachJoinRoomHandler(io, state, socket, joinedRooms, deps);
  attachLeaveRoomHandler(io, state, socket, joinedRooms, deps);
  attachDisconnectHandler(io, state, socket, joinedRooms, deps);
  return { io, socket, joinedRooms, lookup, state };
}

describe("pending room join cancellation", () => {
  it("keeps protected room state alive while password verification is pending", async () => {
    const verification = deferred();
    const verificationStarted = deferred();
    const { io, socket, lookup, state } = createHarness({
      verifyPassword: () => {
        verificationStarted.resolve();
        return verification.promise;
      },
    });
    state.roomPasswordHash.set("room-race", "stored-password-hash");
    state.roomName.set("room-race", "Protected room");

    socket.handlers.get("join_room")({
      roomId: "room-race",
      password: "correct",
    });
    const pending = socket.data.pendingJoins.get("room-race");
    lookup.resolve(null);
    await verificationStarted.promise;

    cleanupRoom(io, state, "room-race");
    assert.equal(
      state.roomPasswordHash.get("room-race"),
      "stored-password-hash",
    );
    assert.equal(state.roomCleanupDeferred.has("room-race"), true);

    verification.resolve(true);
    await pending;

    assert.equal(socket.rooms.has("room-race"), true);
    assert.equal(
      state.roomPasswordHash.get("room-race"),
      "stored-password-hash",
    );
    assert.equal(state.roomName.get("room-race"), "Protected room");
    assert.equal(state.roomCleanupDeferred.has("room-race"), false);
    assert.equal(state.roomPendingJoinCounts.has("room-race"), false);
  });

  it("finishes deferred cleanup when the pending password attempt fails", async () => {
    const verification = deferred();
    const verificationStarted = deferred();
    const { io, socket, lookup, state } = createHarness({
      verifyPassword: () => {
        verificationStarted.resolve();
        return verification.promise;
      },
    });
    state.roomPasswordHash.set("room-race", "stored-password-hash");
    state.roomName.set("room-race", "Protected room");

    socket.handlers.get("join_room")({
      roomId: "room-race",
      password: "wrong",
    });
    const pending = socket.data.pendingJoins.get("room-race");
    lookup.resolve(null);
    await verificationStarted.promise;
    cleanupRoom(io, state, "room-race");

    verification.resolve(false);
    await pending;

    assert.equal(socket.rooms.has("room-race"), false);
    assert.equal(state.roomPasswordHash.has("room-race"), false);
    assert.equal(state.roomName.has("room-race"), false);
    assert.equal(state.roomCleanupDeferred.has("room-race"), false);
    assert.equal(state.roomPendingJoinCounts.has("room-race"), false);
  });

  it("does not resurrect a room after an explicit leave during DB restore", async () => {
    const { io, socket, joinedRooms, lookup, state } = createHarness();

    socket.handlers.get("join_room")("room-race");
    const pending = socket.data.pendingJoins.get("room-race");
    await socket.handlers.get("leave_room")("room-race");
    lookup.resolve({
      name: "Should not be restored",
      videoUrl: "https://example.com/stale.mp4",
      timestamp: 10,
      activePlaylistId: null,
    });
    await pending;

    assert.equal(socket.rooms.has("room-race"), false);
    assert.equal(joinedRooms.has("room-race"), false);
    assert.equal(io.sockets.adapter.rooms.get("room-race")?.size ?? 0, 0);
    assert.equal(socket.data.pendingJoins.has("room-race"), false);
    assert.equal(state.roomName.has("room-race"), false);
    assert.equal(state.roomState.has("room-race"), false);
  });

  it("does not create a ghost member after disconnect during DB restore", async () => {
    const { io, socket, joinedRooms, lookup } = createHarness();

    socket.handlers.get("join_room")("room-race");
    const pending = socket.data.pendingJoins.get("room-race");
    socket.connected = false;
    socket.handlers.get("disconnect")();
    lookup.resolve(null);
    await pending;

    assert.equal(socket.rooms.has("room-race"), false);
    assert.equal(joinedRooms.has("room-race"), false);
    assert.equal(io.sockets.adapter.rooms.get("room-race")?.size ?? 0, 0);
    assert.equal(socket.data.pendingJoins.has("room-race"), false);
  });

  it("lets a new join supersede a cancelled restore without stale cleanup", async () => {
    const { io, socket, joinedRooms, lookup } = createHarness();

    socket.handlers.get("join_room")("room-race");
    const stale = socket.data.pendingJoins.get("room-race");
    await socket.handlers.get("leave_room")("room-race");

    socket.handlers.get("join_room")("room-race");
    const current = socket.data.pendingJoins.get("room-race");
    assert.notEqual(current, stale);

    lookup.resolve(null);
    await Promise.all([stale, current]);

    assert.equal(socket.rooms.has("room-race"), true);
    assert.equal(joinedRooms.has("room-race"), true);
    assert.deepEqual(
      Array.from(io.sockets.adapter.rooms.get("room-race") ?? []),
      [socket.id],
    );
    assert.equal(socket.data.pendingJoins.has("room-race"), false);
  });

  it("counts concurrent pending rooms toward the per-socket room limit", async () => {
    const { io, socket, joinedRooms, lookup } = createHarness();
    const requestedRooms = Array.from(
      { length: 10 },
      (_, index) => `room-${index}`,
    );

    for (const roomId of requestedRooms) {
      socket.handlers.get("join_room")(roomId);
    }

    assert.deepEqual(
      Array.from(socket.data.pendingJoins.keys()),
      requestedRooms.slice(0, 8),
      "pending joins must reserve the same capacity as completed joins",
    );

    const accepted = Array.from(socket.data.pendingJoins.values());
    lookup.resolve(null);
    await Promise.all(accepted);

    assert.equal(joinedRooms.size, 8);
    assert.deepEqual(Array.from(joinedRooms), requestedRooms.slice(0, 8));
    assert.equal(io.sockets.adapter.rooms.has("room-8"), false);
    assert.equal(io.sockets.adapter.rooms.has("room-9"), false);
  });

  it("stops a join whose activity write rejects after disconnect cancellation", async () => {
    const activityStarted = deferred();
    const activityWrite = deferred();
    let activityCalls = 0;
    const { socket, lookup } = createHarness({
      activityCreate: async ({ data }) => {
        activityCalls += 1;
        if (activityCalls === 1) {
          activityStarted.resolve();
          return activityWrite.promise;
        }
        return {
          id: `activity-${activityCalls}`,
          ...data,
          createdAt: new Date(),
        };
      },
    });

    socket.handlers.get("join_room")("room-race");
    const pending = socket.data.pendingJoins.get("room-race");
    lookup.resolve(null);
    await activityStarted.promise;

    const emittedBeforeDisconnect = socket.emitted.length;
    socket.connected = false;
    socket.handlers.get("disconnect")();
    activityWrite.reject(new Error("expected DB failure"));
    await pending;

    assert.equal(
      socket.emitted.length,
      emittedBeforeDisconnect,
      "a cancelled join must not resume snapshot/history emission through its error path",
    );
  });

  it("does not emit playlist data after leave cancels an in-flight join", async () => {
    const playlistStarted = deferred();
    const playlistRead = deferred();
    const { socket, lookup } = createHarness({
      playlistFindMany: () => {
        playlistStarted.resolve();
        return playlistRead.promise;
      },
    });

    socket.handlers.get("join_room")("room-race");
    const pending = socket.data.pendingJoins.get("room-race");
    lookup.resolve(null);
    await playlistStarted.promise;

    await socket.handlers.get("leave_room")("room-race");
    const emittedAtLeave = socket.emitted.length;
    playlistRead.resolve([]);
    await pending;

    assert.deepEqual(socket.emitted.slice(emittedAtLeave), []);
  });

  it("does not emit chat history after leave cancels an in-flight join", async () => {
    const historyStarted = deferred();
    const historyRead = deferred();
    const { socket, lookup } = createHarness({
      messageFindMany: () => {
        historyStarted.resolve();
        return historyRead.promise;
      },
    });

    socket.handlers.get("join_room")("room-race");
    const pending = socket.data.pendingJoins.get("room-race");
    lookup.resolve(null);
    await historyStarted.promise;

    await socket.handlers.get("leave_room")("room-race");
    const emittedAtLeave = socket.emitted.length;
    historyRead.resolve([
      {
        id: "private-message",
        roomId: "room-race",
        senderId: "other",
        text: "must not escape after leave",
        createdAt: new Date(),
      },
    ]);
    await pending;

    assert.deepEqual(socket.emitted.slice(emittedAtLeave), []);
  });

  it("does not emit activity history after leave cancels an in-flight join", async () => {
    const historyStarted = deferred();
    const historyRead = deferred();
    const { socket, lookup } = createHarness({
      activityFindMany: () => {
        historyStarted.resolve();
        return historyRead.promise;
      },
    });

    socket.handlers.get("join_room")("room-race");
    const pending = socket.data.pendingJoins.get("room-race");
    lookup.resolve(null);
    await historyStarted.promise;

    await socket.handlers.get("leave_room")("room-race");
    const emittedAtLeave = socket.emitted.length;
    historyRead.resolve([
      {
        id: "private-activity",
        roomId: "room-race",
        kind: "join",
        createdAt: new Date(),
      },
    ]);
    await pending;

    assert.deepEqual(socket.emitted.slice(emittedAtLeave), []);
  });
});
