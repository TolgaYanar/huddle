const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  createSocketState,
  getBanIdentity,
  cancelRoomCleanup,
  cleanupRoom,
  scheduleRoomCleanup,
} = require("../../state");
const { attachModerationHandlers } = require("../moderation");
const { attachJoinRoomHandler } = require("../joinRoom");

// Fake io/socket harness modeled on requestGating.test.js, extended so a socket
// registers in io.sockets.sockets (kick_user resolves targets through it) and
// can carry an authUser identity + a disconnect() spy.
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

function createFakeSocket(io, id, { authUser } = {}) {
  const socket = {
    id,
    rooms: new Set([id]),
    data: authUser ? { authUser } : {},
    handlers: new Map(),
    emitted: [],
    disconnected: false,
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
    disconnect() {
      socket.disconnected = true;
      // Mirror real socket.io: a disconnect removes the socket from the
      // registry and the adapter rooms.
      io.sockets.sockets.delete(socket.id);
      for (const [, members] of io.sockets.adapter.rooms) {
        members.delete(socket.id);
      }
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
  verifyPassword: (pw, hash) => pw === hash,
  vLog: undefined,
};

function emittedEvents(socket, event) {
  return socket.emitted.filter((e) => e.event === event);
}

describe("ban by stable identity", () => {
  it("rebans an authenticated user across reconnects (new socket.id)", async () => {
    const io = createFakeIo();
    const state = createSocketState();

    // Host (authenticated) and the target (authenticated u1) both in the room.
    const host = createFakeSocket(io, "host-1", { authUser: { id: "hostU" } });
    const target = createFakeSocket(io, "target-old", {
      authUser: { id: "u1" },
    });
    host.join("room1");
    target.join("room1");
    state.roomHost.set("room1", host.id);

    attachModerationHandlers(io, state, host, noopDeps);

    await host.handlers.get("kick_user")({
      roomId: "room1",
      targetId: target.id,
    });

    // Banned by user identity, not the volatile socket.id.
    const banned = state.roomBans.get("room1");
    assert.ok(banned.has("user:u1"));
    assert.equal(banned.has("target-old"), false);
    assert.equal(target.disconnected, true);

    // The same user reconnects with a brand-new socket.id and tries to rejoin.
    const reconnect = createFakeSocket(io, "target-new", {
      authUser: { id: "u1" },
    });
    attachJoinRoomHandler(io, state, reconnect, new Set(), noopDeps);
    reconnect.handlers.get("join_room")("room1");
    await reconnect.data.pendingJoins.get("room1");

    assert.equal(emittedEvents(reconnect, "room_banned").length, 1);
    assert.equal(reconnect.rooms.has("room1"), false);
  });

  it("guest ban is best-effort: a new guest socket.id slips through (documented limitation)", async () => {
    const io = createFakeIo();
    const state = createSocketState();

    const host = createFakeSocket(io, "host-1", { authUser: { id: "hostU" } });
    const guest = createFakeSocket(io, "guest-old"); // no authUser
    host.join("room1");
    guest.join("room1");
    state.roomHost.set("room1", host.id);

    attachModerationHandlers(io, state, host, noopDeps);
    await host.handlers.get("kick_user")({
      roomId: "room1",
      targetId: guest.id,
    });

    const banned = state.roomBans.get("room1");
    assert.ok(banned.has("socket:guest-old"));
    assert.equal(guest.disconnected, true);

    // A new guest connection (different socket.id) is NOT blocked.
    const reconnect = createFakeSocket(io, "guest-new"); // no authUser
    attachJoinRoomHandler(io, state, reconnect, new Set(), noopDeps);
    reconnect.handlers.get("join_room")("room1");
    await reconnect.data.pendingJoins.get("room1");

    assert.equal(emittedEvents(reconnect, "room_banned").length, 0);
    assert.equal(reconnect.rooms.has("room1"), true);
  });

  it("kick falls back to socket:<id> when the target socket is already gone", async () => {
    const io = createFakeIo();
    const state = createSocketState();
    const host = createFakeSocket(io, "host-1", { authUser: { id: "hostU" } });
    host.join("room1");
    state.roomHost.set("room1", host.id);

    attachModerationHandlers(io, state, host, noopDeps);
    await host.handlers.get("kick_user")({
      roomId: "room1",
      targetId: "ghost-id", // never registered in io.sockets.sockets
    });

    assert.ok(state.roomBans.get("room1").has("socket:ghost-id"));
  });

  it("getBanIdentity prefers authUser.id over socket.id", () => {
    assert.equal(
      getBanIdentity({ id: "s1", data: { authUser: { id: "u9" } } }),
      "user:u9",
    );
    assert.equal(getBanIdentity({ id: "s1", data: {} }), "socket:s1");
    assert.equal(getBanIdentity({ id: "s1" }), "socket:s1");
  });
});

// Seed every per-room map so we can assert cleanup wipes them all.
function seedAllRoomMaps(state, roomId) {
  state.roomState.set(roomId, { videoUrl: "u", rev: 1 });
  state.roomName.set(roomId, "My Room");
  state.roomMediaState.set(roomId, new Map([["s1", {}]]));
  state.roomHost.set(roomId, "s1");
  state.roomBans.set(roomId, new Set(["user:u1"]));
  state.roomPasswordHash.set(roomId, "hash");
  state.roomWheel.set(roomId, {});
  state.roomGames.set(roomId, new Map());
  state.roomCupGames.set(roomId, new Map());
  state.roomPlaylistActive.set(roomId, {});
  state.roomTimer.set(roomId, {});
  state.roomChatHistory.set(roomId, []);
  state.roomReactions.set(roomId, new Map());
}

const ALL_ROOM_MAPS = [
  "roomState",
  "roomName",
  "roomMediaState",
  "roomHost",
  "roomBans",
  "roomPasswordHash",
  "roomWheel",
  "roomGames",
  "roomCupGames",
  "roomPlaylistActive",
  "roomTimer",
  "roomChatHistory",
  "roomReactions",
];

describe("grace-period room cleanup", () => {
  it("scheduleRoomCleanup then cancelRoomCleanup leaves maps intact and no pending timer", () => {
    const io = createFakeIo();
    const state = createSocketState();
    seedAllRoomMaps(state, "room1");

    scheduleRoomCleanup(io, state, "room1");
    assert.equal(state.roomCleanupTimers.has("room1"), true);

    cancelRoomCleanup(state, "room1");
    assert.equal(state.roomCleanupTimers.has("room1"), false);

    // Every per-room map still present — nothing was freed.
    for (const mapName of ALL_ROOM_MAPS) {
      assert.equal(state[mapName].has("room1"), true, `${mapName} kept`);
    }
  });

  it("scheduleRoomCleanup does not stack duplicate timers", () => {
    const io = createFakeIo();
    const state = createSocketState();
    scheduleRoomCleanup(io, state, "room1");
    const first = state.roomCleanupTimers.get("room1");
    scheduleRoomCleanup(io, state, "room1");
    const second = state.roomCleanupTimers.get("room1");
    assert.notEqual(first, second);
    assert.equal(state.roomCleanupTimers.size, 1);
    cancelRoomCleanup(state, "room1");
  });

  it("cleanupRoom on a still-empty room deletes every per-room map entry and clears game timers", () => {
    const io = createFakeIo();
    const state = createSocketState();
    seedAllRoomMaps(state, "room1");

    // Two games with live turn timers keyed by gameId; cleanup must clear them.
    const game = { id: "g1", session: {} };
    state.roomGames.set("room1", new Map([["g1", game]]));
    state.gameTurnTimers = new Map([["g1", setTimeout(() => {}, 60000)]]);
    const cupGame = { id: "c1" };
    state.roomCupGames.set("room1", new Map([["c1", cupGame]]));
    state.cupGameTurnTimers.set("c1", setTimeout(() => {}, 60000));

    // Pretend a cleanup was scheduled.
    scheduleRoomCleanup(io, state, "room1");

    // Adapter has no room1 entry => still empty.
    cleanupRoom(io, state, "room1");

    for (const mapName of ALL_ROOM_MAPS) {
      assert.equal(state[mapName].has("room1"), false, `${mapName} freed`);
    }
    assert.equal(state.roomCleanupTimers.has("room1"), false);
    // Game turn timers for this room's games were cancelled.
    assert.equal(state.gameTurnTimers.has("g1"), false);
    assert.equal(state.cupGameTurnTimers.has("c1"), false);
  });

  it("cleanupRoom on a re-populated room is a no-op for the data maps", () => {
    const io = createFakeIo();
    const state = createSocketState();
    seedAllRoomMaps(state, "room1");
    scheduleRoomCleanup(io, state, "room1");

    // Someone rejoined: the adapter room now has a member.
    io.sockets.adapter.rooms.set("room1", new Set(["rejoiner"]));

    cleanupRoom(io, state, "room1");

    // Data maps untouched; only the timer entry was dropped.
    for (const mapName of ALL_ROOM_MAPS) {
      assert.equal(state[mapName].has("room1"), true, `${mapName} kept`);
    }
    assert.equal(state.roomCleanupTimers.has("room1"), false);
  });

  it("cancelRoomCleanup is a no-op when no timer exists", () => {
    const state = createSocketState();
    cancelRoomCleanup(state, "room-none"); // must not throw
    assert.equal(state.roomCleanupTimers.has("room-none"), false);
  });

  it("a wrong-password probe during the grace window does NOT cancel cleanup (P2 leak guard)", async () => {
    const io = createFakeIo();
    const state = createSocketState();
    seedAllRoomMaps(state, "room1");
    // Password-protected room that has emptied; cleanup is pending.
    state.roomPasswordHash.set("room1", "hunter2");
    scheduleRoomCleanup(io, state, "room1");
    assert.equal(state.roomCleanupTimers.has("room1"), true);

    // An attacker who only knows the roomId sends a WRONG password. They never
    // become an adapter member, so they must not be able to cancel the timer
    // (which would permanently pin the emptied room's memory).
    const prober = createFakeSocket(io, "prober");
    attachJoinRoomHandler(io, state, prober, new Set(), noopDeps);
    prober.handlers.get("join_room")({ roomId: "room1", password: "wrong" });
    await prober.data.pendingJoins.get("room1");

    assert.equal(emittedEvents(prober, "room_requires_password").length, 1);
    assert.equal(prober.rooms.has("room1"), false);
    // The pending cleanup is intact: the probe did not cancel it.
    assert.equal(state.roomCleanupTimers.has("room1"), true);

    cancelRoomCleanup(state, "room1");
  });

  it("a banned-identity probe during the grace window does NOT cancel cleanup", async () => {
    const io = createFakeIo();
    const state = createSocketState();
    seedAllRoomMaps(state, "room1");
    // Drop the seeded password so this case isolates the ban early-return.
    state.roomPasswordHash.delete("room1");
    state.roomBans.set("room1", new Set(["user:u1"]));
    scheduleRoomCleanup(io, state, "room1");
    assert.equal(state.roomCleanupTimers.has("room1"), true);

    const banned = createFakeSocket(io, "banned-new", { authUser: { id: "u1" } });
    attachJoinRoomHandler(io, state, banned, new Set(), noopDeps);
    banned.handlers.get("join_room")("room1");
    await banned.data.pendingJoins.get("room1");

    assert.equal(emittedEvents(banned, "room_banned").length, 1);
    assert.equal(banned.rooms.has("room1"), false);
    // Cleanup still pending — the banned probe did not pin memory.
    assert.equal(state.roomCleanupTimers.has("room1"), true);

    cancelRoomCleanup(state, "room1");
  });

  it("a join cancels a pending cleanup so room state survives a reconnect blip", async () => {
    const io = createFakeIo();
    const state = createSocketState();
    seedAllRoomMaps(state, "room1");
    // Host seed would otherwise re-run; clear it so ensureRoomHost on join is clean.
    state.roomHost.delete("room1");
    // Clear the seeded password so this models a genuine successful (re)join:
    // cancelRoomCleanup runs only AFTER the ban/password checks pass, so a join
    // that clears those gates is what cancels the pending cleanup.
    state.roomPasswordHash.delete("room1");

    scheduleRoomCleanup(io, state, "room1");
    assert.equal(state.roomCleanupTimers.has("room1"), true);

    const rejoiner = createFakeSocket(io, "rejoiner");
    attachJoinRoomHandler(io, state, rejoiner, new Set(), noopDeps);
    rejoiner.handlers.get("join_room")("room1");
    await rejoiner.data.pendingJoins.get("room1");

    // Cleanup was cancelled and the room name (a per-room map) survived.
    assert.equal(state.roomCleanupTimers.has("room1"), false);
    assert.equal(state.roomName.get("room1"), "My Room");
  });
});
