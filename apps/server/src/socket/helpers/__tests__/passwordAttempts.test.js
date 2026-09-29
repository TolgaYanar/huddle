const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createSocketState, cleanupRoom } = require("../../state");
const {
  PASSWORD_FAILURE_WINDOW_MS,
  MAX_PASSWORD_FAILURES,
  isPasswordThrottled,
  recordPasswordFailure,
} = require("../passwordAttempts");
const { attachJoinRoomHandler } = require("../../handlers/joinRoom");

describe("password failure throttle", () => {
  it("throttles a room after MAX_PASSWORD_FAILURES in the window", () => {
    const state = createSocketState();
    const t0 = 1_000_000;
    for (let i = 0; i < MAX_PASSWORD_FAILURES - 1; i += 1) {
      recordPasswordFailure(state, "room", t0 + i);
    }
    assert.equal(isPasswordThrottled(state, "room", t0 + 100), false);
    recordPasswordFailure(state, "room", t0 + 100);
    assert.equal(isPasswordThrottled(state, "room", t0 + 101), true);
    assert.equal(isPasswordThrottled(state, "other-room", t0 + 101), false);
  });

  it("recovers once the window passes and frees the entry", () => {
    const state = createSocketState();
    const t0 = 1_000_000;
    for (let i = 0; i < MAX_PASSWORD_FAILURES; i += 1) {
      recordPasswordFailure(state, "room", t0);
    }
    const later = t0 + PASSWORD_FAILURE_WINDOW_MS;
    assert.equal(isPasswordThrottled(state, "room", later), false);
    assert.equal(state.roomPasswordFailures.has("room"), false);
  });

  it("is freed with the rest of the room's state", () => {
    const state = createSocketState();
    recordPasswordFailure(state, "room");
    const io = { sockets: { adapter: { rooms: new Map() } } };
    cleanupRoom(io, state, "room");
    assert.equal(state.roomPasswordFailures.has("room"), false);
  });
});

describe("join_room under password throttle", () => {
  function harness() {
    const io = {
      sockets: { adapter: { rooms: new Map() }, sockets: new Map() },
      to: () => ({ emit() {} }),
    };
    const state = createSocketState();
    state.roomPasswordHash.set("room", "stored-hash");
    let verifyCalls = 0;
    const deps = {
      isDbConnected: () => false,
      getPrisma: () => null,
      verifyPassword: async () => {
        verifyCalls += 1;
        return false;
      },
    };
    const makeSocket = (id) => {
      const socket = {
        id,
        connected: true,
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
        to: () => ({ emit() {} }),
        join() {},
      };
      io.sockets.sockets.set(id, socket);
      attachJoinRoomHandler(io, state, socket, new Set(), deps);
      return socket;
    };
    return { state, makeSocket, verifyCalls: () => verifyCalls };
  }

  async function join(socket, password) {
    socket.handlers.get("join_room")({ roomId: "room", password });
    await socket.data.pendingJoins?.get("room");
  }

  it("stops verifying guesses spread across many sockets", async () => {
    const { makeSocket, verifyCalls } = harness();
    // One guess per socket, so the per-socket join limiter never engages.
    for (let i = 0; i < MAX_PASSWORD_FAILURES; i += 1) {
      await join(makeSocket(`s${i}`), `guess-${i}`);
    }
    assert.equal(verifyCalls(), MAX_PASSWORD_FAILURES);

    const next = makeSocket("next");
    await join(next, "another-guess");

    assert.equal(verifyCalls(), MAX_PASSWORD_FAILURES, "scrypt was skipped");
    assert.deepEqual(next.emitted.at(-1), {
      event: "room_requires_password",
      payload: { roomId: "room", reason: "throttled" },
    });
  });

  it("does not count the empty-password probe as a guess", async () => {
    const { state, makeSocket } = harness();
    for (let i = 0; i < MAX_PASSWORD_FAILURES + 5; i += 1) {
      await join(makeSocket(`p${i}`), undefined);
    }
    assert.equal(isPasswordThrottled(state, "room"), false);
  });
});
