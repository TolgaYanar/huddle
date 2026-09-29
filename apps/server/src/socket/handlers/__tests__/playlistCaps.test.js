const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createSocketState } = require("../../state");
const { attachPlaylistCrudHandlers } = require("../playlistCrud");
const { attachPlaylistItemHandlers } = require("../playlistItems");
const {
  MAX_PLAYLISTS_PER_ROOM,
  MAX_ITEMS_PER_PLAYLIST,
} = require("../../helpers/playlists");

function createHarness({ playlistCount = 0, itemCount = 0 } = {}) {
  const created = { playlists: 0, items: 0 };
  const prisma = {
    roomPlaylist: {
      count: async () => playlistCount,
      create: async () => {
        created.playlists += 1;
      },
      findFirst: async () => ({ id: "pl-1" }),
      findMany: async () => [],
    },
    roomPlaylistItem: {
      count: async () => itemCount,
      findFirst: async () => ({ position: itemCount - 1 }),
      create: async () => {
        created.items += 1;
      },
    },
  };
  const io = { to: () => ({ emit() {} }) };
  const handlers = new Map();
  const socket = {
    id: "member",
    rooms: new Set(["member", "room"]),
    data: {},
    on(event, fn) {
      handlers.set(event, fn);
    },
    emit() {},
  };
  const deps = { isDbConnected: () => true, getPrisma: () => prisma };
  const state = createSocketState();
  attachPlaylistCrudHandlers(io, state, socket, deps);
  attachPlaylistItemHandlers(io, state, socket, deps);
  return { handlers, created };
}

describe("playlist caps", () => {
  it("creates a playlist below the per-room cap", async () => {
    const { handlers, created } = createHarness({ playlistCount: 3 });
    await handlers.get("playlist_create")({ roomId: "room", name: "Mine" });
    assert.equal(created.playlists, 1);
  });

  it("refuses a playlist once the room is at the cap", async () => {
    const { handlers, created } = createHarness({
      playlistCount: MAX_PLAYLISTS_PER_ROOM,
    });
    await handlers.get("playlist_create")({ roomId: "room", name: "More" });
    assert.equal(created.playlists, 0);
  });

  it("adds an item below the per-playlist cap", async () => {
    const { handlers, created } = createHarness({ itemCount: 499 });
    await handlers.get("playlist_add_item")({
      roomId: "room",
      playlistId: "pl-1",
      videoUrl: "https://youtu.be/abc",
    });
    assert.equal(created.items, 1);
  });

  it("refuses an item once the playlist is at the cap", async () => {
    const { handlers, created } = createHarness({
      itemCount: MAX_ITEMS_PER_PLAYLIST,
    });
    await handlers.get("playlist_add_item")({
      roomId: "room",
      playlistId: "pl-1",
      videoUrl: "https://youtu.be/abc",
    });
    assert.equal(created.items, 0);
  });

  it("leaves room for the largest playlist import (500 videos)", () => {
    assert.ok(MAX_ITEMS_PER_PLAYLIST >= 500);
  });
});
