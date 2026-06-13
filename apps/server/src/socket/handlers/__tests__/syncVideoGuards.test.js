const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createSocketState } = require("../../state");
const { attachSyncHandlers } = require("../syncVideo");

// Light fake-socket harness, mirroring requestGating.test.js. We only need
// enough of io/socket to drive the sync_video handler and inspect the room
// state it writes. io.to().emit is a no-op; we assert on state.roomState.
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
  const vLogs = [];
  // Minimal no-op prisma so the handler's activity-persistence try/catch
  // doesn't spew console.error noise on accepted sync events. Not asserted on.
  const fakePrisma = {
    roomActivity: { create: async () => ({}) },
  };
  const deps = {
    isDbConnected: () => false,
    getPrisma: () => fakePrisma,
    vLog: (...args) => vLogs.push(args.join(" ")),
  };
  attachSyncHandlers(io, state, socket, deps);
  // Join so the membership gate passes.
  socket.join("room1");
  return { io, state, socket, vLogs };
}

describe("sync_video URL-set guard (S1)", () => {
  it("change_url sets the room videoUrl", async () => {
    const { state, socket } = createHarness();
    await socket.handlers.get("sync_video")({
      roomId: "room1",
      action: "change_url",
      timestamp: 0,
      videoUrl: "https://youtube.com/watch?v=legit",
    });
    assert.equal(
      state.roomState.get("room1").videoUrl,
      "https://youtube.com/watch?v=legit",
    );
  });

  it("play/pause/seek cannot overwrite the room videoUrl (hijack defense)", async () => {
    const { state, socket } = createHarness();
    const sync = socket.handlers.get("sync_video");

    await sync({
      roomId: "room1",
      action: "change_url",
      timestamp: 0,
      videoUrl: "https://youtube.com/watch?v=legit",
    });

    // An older extension build attaching its own tab URL to play/pause/seek
    // must NOT move the room off the legit URL.
    await sync({
      roomId: "room1",
      action: "play",
      timestamp: 1,
      videoUrl: "https://netflix.com/watch/HIJACK",
    });
    assert.equal(
      state.roomState.get("room1").videoUrl,
      "https://youtube.com/watch?v=legit",
    );

    await sync({
      roomId: "room1",
      action: "seek",
      timestamp: 2,
      videoUrl: "https://netflix.com/watch/HIJACK2",
    });
    assert.equal(
      state.roomState.get("room1").videoUrl,
      "https://youtube.com/watch?v=legit",
    );

    await sync({
      roomId: "room1",
      action: "pause",
      timestamp: 3,
      videoUrl: "https://netflix.com/watch/HIJACK3",
    });
    assert.equal(
      state.roomState.get("room1").videoUrl,
      "https://youtube.com/watch?v=legit",
    );
  });
});

describe("sync_video action allowlist (S4)", () => {
  it("drops an unknown action without mutating room state", async () => {
    const { state, socket, vLogs } = createHarness();
    const sync = socket.handlers.get("sync_video");

    // Seed a known-good state.
    await sync({
      roomId: "room1",
      action: "change_url",
      timestamp: 0,
      videoUrl: "https://youtube.com/watch?v=legit",
    });
    const before = state.roomState.get("room1");

    await sync({ roomId: "room1", action: "evil_action", timestamp: 9 });

    // State object unchanged (no new rev, no mutation).
    assert.equal(state.roomState.get("room1"), before);
    assert.equal(before.action, "change_url");
    assert.ok(
      vLogs.some((l) => l.includes("Dropping disallowed sync action")),
      "expected a vLog for the dropped action",
    );
  });

  it("drops a non-string action", async () => {
    const { state, socket } = createHarness();
    const sync = socket.handlers.get("sync_video");
    await sync({ roomId: "room1", action: 42, timestamp: 1 });
    assert.equal(state.roomState.has("room1"), false);
  });

  it("accepts every allowlisted action", async () => {
    const { state, socket } = createHarness();
    const sync = socket.handlers.get("sync_video");
    const actions = [
      "play",
      "pause",
      "seek",
      "change_url",
      "set_speed",
      "set_volume",
      "set_mute",
      "set_audio_sync",
    ];
    let ts = 0;
    for (const action of actions) {
      // Distinct timestamps avoid the 250ms dedupe collapsing them.
      await sync({ roomId: "room1", action, timestamp: ++ts });
    }
    // The last accepted action is recorded.
    assert.equal(state.roomState.get("room1").action, "set_audio_sync");
  });
});

describe("sync_video rate limit (H1)", () => {
  it("drops the (max+1)th event in the window while earlier ones pass", async () => {
    const { state, socket, vLogs } = createHarness();
    const sync = socket.handlers.get("sync_video");

    // The limiter is { windowMs: 2000, max: 40 }. Distinct timestamps avoid the
    // 250ms identical-dedupe so each event is independently accountable. All 40
    // must pass, the 41st must be dropped (within the same 2s window).
    for (let i = 1; i <= 40; i++) {
      await sync({ roomId: "room1", action: "seek", timestamp: i });
    }
    const after40 = state.roomState.get("room1");
    assert.equal(after40.timestamp, 40, "the 40th event should have applied");
    const revAfter40 = after40.rev;

    // 41st event in the window is rate-limited: room state must not advance.
    await sync({ roomId: "room1", action: "seek", timestamp: 41 });
    const after41 = state.roomState.get("room1");
    assert.equal(after41.timestamp, 40, "the 41st event must be dropped");
    assert.equal(after41.rev, revAfter40, "dropped event must not bump rev");
    assert.ok(
      vLogs.some((l) => l.includes("Rate-limiting sync_video")),
      "expected a vLog for the rate-limited event",
    );
  });
});

describe("sync_video videoUrl length cap (H3)", () => {
  it("drops a change_url with an over-2048-char videoUrl (state unchanged)", async () => {
    const { state, socket, vLogs } = createHarness();
    const sync = socket.handlers.get("sync_video");

    // Seed a legit URL first.
    await sync({
      roomId: "room1",
      action: "change_url",
      timestamp: 0,
      videoUrl: "https://youtube.com/watch?v=legit",
    });
    const before = state.roomState.get("room1");

    const overlong = `https://example.com/?q=${"a".repeat(2048)}`;
    await sync({
      roomId: "room1",
      action: "change_url",
      timestamp: 1,
      videoUrl: overlong,
    });

    // Same state object — the overlong change_url was dropped before any mutation.
    assert.equal(state.roomState.get("room1"), before);
    assert.equal(
      state.roomState.get("room1").videoUrl,
      "https://youtube.com/watch?v=legit",
    );
    assert.ok(
      vLogs.some((l) => l.includes("overlong videoUrl")),
      "expected a vLog for the dropped overlong URL",
    );
  });

  it("accepts a change_url whose videoUrl is exactly at the 2048 cap", async () => {
    const { state, socket } = createHarness();
    const sync = socket.handlers.get("sync_video");
    const atCap = `https://x/${"b".repeat(2048 - "https://x/".length)}`;
    assert.equal(atCap.length, 2048);
    await sync({
      roomId: "room1",
      action: "change_url",
      timestamp: 0,
      videoUrl: atCap,
    });
    assert.equal(state.roomState.get("room1").videoUrl, atCap);
  });
});

describe("sync_video activity persist is fire-and-forget (H2)", () => {
  it("emits receive_sync even when the activity insert rejects", async () => {
    // Build a harness that captures io.to(room).emit and uses a prisma whose
    // roomActivity.create rejects — proving the broadcast does not await it.
    const state = createSocketState();
    const emits = [];
    const io = {
      sockets: { adapter: { rooms: new Map() }, sockets: new Map() },
      to() {
        return {
          emit(event, payload) {
            emits.push({ event, payload });
          },
        };
      },
    };
    const socket = createFakeSocket(io, "socket-ff");
    let createCalled = false;
    const rejectingPrisma = {
      roomActivity: {
        create: async () => {
          createCalled = true;
          throw new Error("db down");
        },
      },
    };
    const deps = {
      isDbConnected: () => false,
      getPrisma: () => rejectingPrisma,
      vLog: undefined,
    };
    attachSyncHandlers(io, state, socket, deps);
    socket.join("room1");

    // Must not reject even though the activity insert does.
    await socket.handlers.get("sync_video")({
      roomId: "room1",
      action: "play",
      timestamp: 5,
    });

    // The broadcast happened despite the (async) insert rejection.
    assert.ok(
      emits.some((e) => e.event === "receive_sync"),
      "receive_sync must be emitted regardless of activity-insert failure",
    );
    // Room state advanced normally.
    assert.equal(state.roomState.get("room1").isPlaying, true);
    // Let the rejected promise settle so its .catch runs (no unhandled rejection).
    await Promise.resolve();
    assert.equal(createCalled, true, "the activity insert was attempted");
  });
});
