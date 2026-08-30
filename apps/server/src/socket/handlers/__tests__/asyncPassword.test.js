const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { attachModerationHandlers } = require("../moderation");
const { createSocketState } = require("../../state");

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// Use the real state factory rather than a hand-built object: the moderation
// handler reads per-room maps that must stay in step with createSocketState.
function createIo() {
  return {
    sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
    to() {
      return { emit() {} };
    },
  };
}

function attachHost(io, state, hashPassword, socketId = "host") {
  const handlers = new Map();
  const socket = {
    id: socketId,
    data: {},
    on(event, handler) {
      handlers.set(event, handler);
    },
  };
  attachModerationHandlers(io, state, socket, {
    hashPassword,
    isDbConnected: () => false,
    getPrisma: () => null,
  });
  return handlers.get("set_room_password");
}

function createHarness(hashPassword) {
  const state = createSocketState();
  state.roomHost.set("room", "host");
  const io = createIo();
  return { state, io, setPassword: attachHost(io, state, hashPassword) };
}

describe("async room password updates", () => {
  it("keeps the newest password when hashes finish out of order", async () => {
    const first = deferred();
    const second = deferred();
    const { state, setPassword } = createHarness((password) =>
      password === "first" ? first.promise : second.promise,
    );

    const firstUpdate = setPassword({ roomId: "room", password: "first" });
    const secondUpdate = setPassword({ roomId: "room", password: "second" });

    second.resolve("hash-second");
    await secondUpdate;
    first.resolve("hash-first");
    await firstUpdate;

    assert.equal(state.roomPasswordHash.get("room"), "hash-second");
  });

  it("does not restore a password that was cleared while hashing", async () => {
    const pending = deferred();
    const { state, setPassword } = createHarness(() => pending.promise);

    const setUpdate = setPassword({ roomId: "room", password: "secret" });
    await setPassword({ roomId: "room", password: "" });
    pending.resolve("late-hash");
    await setUpdate;

    assert.equal(state.roomPasswordHash.has("room"), false);
  });
});

describe("room password ordering across sockets", () => {
  it("does not let a former host's in-flight hash overwrite the new host's password", async () => {
    // attachModerationHandlers runs once per connection. With the generation
    // counter held per handler, two different sockets could not be ordered
    // against each other; it lives on the shared room state for that reason.
    const state = createSocketState();
    const io = createIo();
    state.roomHost.set("room", "host-a");

    const slow = deferred();
    const setByA = attachHost(io, state, () => slow.promise, "host-a");
    const setByB = attachHost(io, state, async () => "hash-b", "host-b");

    const pendingA = setByA({ roomId: "room", password: "from-a" });

    // Host changes hands while A's hash is still running.
    state.roomHost.set("room", "host-b");
    await setByB({ roomId: "room", password: "from-b" });
    assert.equal(state.roomPasswordHash.get("room"), "hash-b");

    slow.resolve("hash-a");
    await pendingA;

    assert.equal(
      state.roomPasswordHash.get("room"),
      "hash-b",
      "the stale hash from the former host must not win",
    );
  });

  it("rejects a stale hash even when its socket is host again by the time it lands", async () => {
    // This is the case a per-handler counter cannot catch: the stale writer IS
    // the current host at commit time, so the host check passes. Only a
    // room-scoped generation knows that a newer update already committed.
    const state = createSocketState();
    const io = createIo();
    state.roomHost.set("room", "host-a");

    const slow = deferred();
    const setByA = attachHost(io, state, () => slow.promise, "host-a");
    const setByB = attachHost(io, state, async () => "hash-b", "host-b");

    const pendingA = setByA({ roomId: "room", password: "from-a" });

    state.roomHost.set("room", "host-b");
    await setByB({ roomId: "room", password: "from-b" });
    assert.equal(state.roomPasswordHash.get("room"), "hash-b");

    // Host comes back to A (B disconnects, A is promoted again).
    state.roomHost.set("room", "host-a");

    slow.resolve("hash-a");
    await pendingA;

    assert.equal(
      state.roomPasswordHash.get("room"),
      "hash-b",
      "the older request must not win just because its socket is host again",
    );
  });

  it("bumps the shared generation so a clear cannot be undone by another socket", async () => {
    const state = createSocketState();
    const io = createIo();
    state.roomHost.set("room", "host-a");

    const slow = deferred();
    const setByA = attachHost(io, state, () => slow.promise, "host-a");
    const setByB = attachHost(io, state, async () => "hash-b", "host-b");

    const pendingA = setByA({ roomId: "room", password: "from-a" });

    state.roomHost.set("room", "host-b");
    await setByB({ roomId: "room", password: "" });
    assert.equal(state.roomPasswordHash.has("room"), false);

    slow.resolve("hash-a");
    await pendingA;

    assert.equal(
      state.roomPasswordHash.has("room"),
      false,
      "a cleared password must stay cleared",
    );
  });
});
