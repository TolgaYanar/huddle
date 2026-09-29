const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createSocketState } = require("../../state");
const { attachRoomSettingsHandlers } = require("../roomSettings");

function createHarness({
  id = "host",
  rooms = ["room"],
  hostOf = "room",
  dbConnected = true,
} = {}) {
  const upserts = [];
  const prisma = {
    roomState: {
      async upsert(args) {
        upserts.push(args);
        return {};
      },
    },
  };
  const io = {
    relayed: [],
    to(target) {
      return {
        emit(event, payload) {
          io.relayed.push({ target, event, payload });
        },
      };
    },
  };
  const socket = {
    id,
    rooms: new Set([id, ...rooms]),
    handlers: new Map(),
    on(event, fn) {
      socket.handlers.set(event, fn);
    },
    emit() {},
  };
  const state = createSocketState();
  if (hostOf) state.roomHost.set(hostOf, id);
  attachRoomSettingsHandlers(io, state, socket, {
    isDbConnected: () => dbConnected,
    getPrisma: () => prisma,
  });
  const setName = (payload) => socket.handlers.get("set_room_name")(payload);
  return { io, state, upserts, setName };
}

describe("set_room_name", () => {
  it("trims the name, stores it, broadcasts and persists", async () => {
    const h = createHarness();
    await h.setName({ roomId: "room", name: "  Movie night  " });
    assert.equal(h.state.roomName.get("room"), "Movie night");
    assert.deepEqual(h.io.relayed, [
      {
        target: "room",
        event: "room_name_changed",
        payload: { roomId: "room", name: "Movie night" },
      },
    ]);
    assert.equal(h.upserts.length, 1);
    assert.equal(h.upserts[0].where.roomId, "room");
    assert.equal(h.upserts[0].update.name, "Movie night");
    assert.equal(h.upserts[0].create.name, "Movie night");
  });

  it("truncates to 40 characters after trimming", async () => {
    const h = createHarness();
    await h.setName({ roomId: "room", name: `   ${"x".repeat(41)}` });
    assert.equal(h.state.roomName.get("room"), "x".repeat(40));
    assert.equal(h.io.relayed[0].payload.name, "x".repeat(40));
  });

  it("keeps a name of exactly 40 characters", async () => {
    const h = createHarness();
    await h.setName({ roomId: "room", name: "y".repeat(40) });
    assert.equal(h.state.roomName.get("room"), "y".repeat(40));
  });

  for (const name of ["", "    ", undefined, null, 42, { a: 1 }]) {
    it(`clears the name for ${JSON.stringify(name)}`, async () => {
      const h = createHarness();
      h.state.roomName.set("room", "Old");
      await h.setName({ roomId: "room", name });
      assert.equal(h.state.roomName.has("room"), false);
      assert.deepEqual(h.io.relayed[0].payload, { roomId: "room", name: null });
      assert.equal(h.upserts[0].update.name, null);
    });
  }

  it("still broadcasts when the database is disconnected", async () => {
    const h = createHarness({ dbConnected: false });
    await h.setName({ roomId: "room", name: "Offline" });
    assert.equal(h.state.roomName.get("room"), "Offline");
    assert.equal(h.io.relayed.length, 1);
    assert.equal(h.upserts.length, 0);
  });

  it("is refused for a member who is not the host", async () => {
    const h = createHarness({ id: "guest", hostOf: null });
    h.state.roomHost.set("room", "host");
    await h.setName({ roomId: "room", name: "Mine" });
    assert.equal(h.state.roomName.has("room"), false);
    assert.deepEqual(h.io.relayed, []);
    assert.equal(h.upserts.length, 0);
  });

  it("is refused when the room has no host", async () => {
    const h = createHarness({ hostOf: null });
    await h.setName({ roomId: "room", name: "Mine" });
    assert.deepEqual(h.io.relayed, []);
  });

  it("is refused for a recorded host that is no longer a member", async () => {
    const h = createHarness({ rooms: [] });
    await h.setName({ roomId: "room", name: "Ghost" });
    assert.equal(h.state.roomName.has("room"), false);
    assert.deepEqual(h.io.relayed, []);
    assert.equal(h.upserts.length, 0);
  });

  it("is refused when roomId is the caller's own socket id", async () => {
    // Seed roomHost for the pseudo-room so only the membership gate can
    // be what refuses it.
    const h = createHarness({ rooms: [], hostOf: "host" });
    await h.setName({ roomId: "host", name: "Pseudo" });
    assert.equal(h.state.roomName.has("host"), false);
    assert.deepEqual(h.io.relayed, []);
    assert.equal(h.upserts.length, 0);
  });

  it("does not let the host of one room rename another", async () => {
    const h = createHarness({ rooms: ["room", "other"] });
    await h.setName({ roomId: "other", name: "Hijack" });
    assert.equal(h.state.roomName.has("other"), false);
    assert.deepEqual(h.io.relayed, []);
  });

  for (const payload of [undefined, {}, { roomId: 7, name: "x" }]) {
    it(`ignores malformed payload ${JSON.stringify(payload)}`, async () => {
      const h = createHarness();
      await h.setName(payload);
      assert.deepEqual(h.io.relayed, []);
      assert.equal(h.state.roomName.size, 0);
    });
  }
});
