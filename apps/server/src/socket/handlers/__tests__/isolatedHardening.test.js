const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createSocketState } = require("../../state");
const { attachUsernameHandlers } = require("../username");
const { attachPlaylistItemHandlers } = require("../playlistItems");

// --- Shared fakes (modeled on requestGating.test.js's harness) ---

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
    },
    to() {
      return { emit() {} };
    },
  };
  return socket;
}

function emittedEvents(socket, event) {
  return socket.emitted.filter((e) => e.event === event);
}

// =====================================================================
// I1 — "Playlist" username is reserved (guest impersonation closed)
// =====================================================================
describe("I1: reserved 'Playlist' username", () => {
  function setup() {
    const io = createFakeIo();
    const state = createSocketState();
    const socket = createFakeSocket(io, "socket-1");
    socket.join("room1"); // be a member of a room so fan-out has a target
    attachUsernameHandlers(io, state, socket);
    return { io, state, socket };
  }

  const reservedVariants = ["Playlist", "playlist", " PLAYLIST ", "pLaYlIsT"];

  for (const variant of reservedVariants) {
    it(`rejects set_username "${variant}" (does not store the reserved value)`, () => {
      const { state, socket } = setup();

      socket.handlers.get("set_username")({ username: variant });

      // The reserved name is treated like an empty name: nothing stored.
      assert.equal(state.socketIdToUsername.has("socket-1"), false);

      // Fan-out still happens, but with username: null (never the reserved value).
      const changes = emittedEvents(socket, "username_changed");
      assert.ok(changes.length >= 1);
      for (const c of changes) {
        assert.equal(c.payload.username, null);
      }
    });
  }

  it("does not clobber an existing username when a reserved name is rejected... actually clears it like empty (documented behavior)", () => {
    const { state, socket } = setup();

    // First set a normal name.
    socket.handlers.get("set_username")({ username: "alice" });
    assert.equal(state.socketIdToUsername.get("socket-1"), "alice");

    // Then attempt the reserved name — treated as empty, so it clears.
    socket.handlers.get("set_username")({ username: "Playlist" });
    assert.equal(state.socketIdToUsername.has("socket-1"), false);
  });

  it("still stores and fans out a normal username", () => {
    const { state, socket } = setup();

    socket.handlers.get("set_username")({ username: "  Bob  " });

    assert.equal(state.socketIdToUsername.get("socket-1"), "Bob");

    const changes = emittedEvents(socket, "username_changed");
    assert.ok(changes.length >= 1);
    assert.equal(changes[changes.length - 1].payload.username, "Bob");
  });

  it("still allows names that merely contain 'playlist' as a substring", () => {
    const { state, socket } = setup();

    socket.handlers.get("set_username")({ username: "PlaylistFan" });

    assert.equal(state.socketIdToUsername.get("socket-1"), "PlaylistFan");
  });
});

// =====================================================================
// I2 — playlist_reorder_items is scoped to the room's playlist (IDOR)
// =====================================================================
//
// The prisma surface here is purely about the WHERE clause shape, so we use a
// light fake prisma that records every updateMany() call. We assert that each
// recorded where-clause carries the { playlist: { roomId } } relation scope, so
// items belonging to another room can never be matched/updated.
describe("I2: playlist_reorder_items room scoping", () => {
  function createRecordingPrisma() {
    const updateManyCalls = [];
    const prisma = {
      roomPlaylist: {
        // Not the active playlist in our test, so this is unused, but present
        // for completeness.
        findUnique: async () => null,
      },
      roomPlaylistItem: {
        updateMany: (args) => {
          updateManyCalls.push(args);
          return Promise.resolve({ count: 1 });
        },
      },
      $transaction: (ops) => Promise.all(ops),
    };
    return { prisma, updateManyCalls };
  }

  function setup(prisma) {
    const io = createFakeIo();
    const state = createSocketState();
    const socket = createFakeSocket(io, "socket-1");
    socket.join("room1");
    const deps = {
      isDbConnected: () => true,
      getPrisma: () => prisma,
    };
    attachPlaylistItemHandlers(io, state, socket, deps);
    return { io, state, socket };
  }

  it("scopes every position update to { id, playlist: { roomId } }", async () => {
    const { prisma, updateManyCalls } = createRecordingPrisma();
    const { socket } = setup(prisma);

    await socket.handlers.get("playlist_reorder_items")({
      roomId: "room1",
      playlistId: "pl1",
      itemIds: ["itemA", "itemB", "itemC"],
    });

    assert.equal(updateManyCalls.length, 3);
    updateManyCalls.forEach((call, index) => {
      // Position is the array index.
      assert.equal(call.data.position, index);
      // Relation scope present: cross-room items can't match this where.
      assert.deepEqual(call.where.playlist, { roomId: "room1" });
      // The id is still part of the compound where.
      assert.ok(typeof call.where.id === "string");
    });

    // The ids reordered are exactly the requested ones, in order.
    assert.deepEqual(
      updateManyCalls.map((c) => c.where.id),
      ["itemA", "itemB", "itemC"],
    );
  });

  it("re-broadcasts playlist_state after reordering", async () => {
    const { prisma } = createRecordingPrisma();
    // emitPlaylistStateToRoom uses io.to(roomId).emit — capture it.
    const emittedToRoom = [];
    const io = createFakeIo();
    io.to = () => ({
      emit(event, payload) {
        emittedToRoom.push({ event, payload });
      },
    });
    const state = createSocketState();
    const socket = createFakeSocket(io, "socket-1");
    socket.join("room1");
    const deps = {
      isDbConnected: () => true,
      getPrisma: () => prisma,
    };
    attachPlaylistItemHandlers(io, state, socket, deps);

    await socket.handlers.get("playlist_reorder_items")({
      roomId: "room1",
      playlistId: "pl1",
      itemIds: ["itemA"],
    });

    const states = emittedToRoom.filter((e) => e.event === "playlist_state");
    assert.equal(states.length, 1);
    assert.equal(states[0].payload.roomId, "room1");
  });

  it("drops the reorder entirely when the socket is not in the room", async () => {
    const { prisma, updateManyCalls } = createRecordingPrisma();
    const io = createFakeIo();
    const state = createSocketState();
    const socket = createFakeSocket(io, "socket-1"); // not joined to room1
    const deps = {
      isDbConnected: () => true,
      getPrisma: () => prisma,
    };
    attachPlaylistItemHandlers(io, state, socket, deps);

    await socket.handlers.get("playlist_reorder_items")({
      roomId: "room1",
      playlistId: "pl1",
      itemIds: ["itemA"],
    });

    assert.equal(updateManyCalls.length, 0);
  });
});
