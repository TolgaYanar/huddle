const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createSocketState } = require("../../state");
const { attachPlaylistCrudHandlers } = require("../playlistCrud");
const { attachPlaylistItemHandlers } = require("../playlistItems");
const { attachPlaylistPlaybackHandlers } = require("../playlistPlayback");

// In-memory stand-in for the slice of Prisma the playlist handlers use.
// Every call is recorded so gating tests can prove the DB was never touched.
function createFakePrisma() {
  const playlists = [];
  const items = [];
  const calls = [];
  let seq = 0;

  const withItems = (p) => ({
    ...p,
    items: items
      .filter((i) => i.playlistId === p.id)
      .sort((a, b) => a.position - b.position)
      .map((i) => ({ ...i })),
  });
  const itemInRoom = (item, roomId) =>
    playlists.some((p) => p.id === item.playlistId && p.roomId === roomId);
  const matchPlaylist = (where) => (p) =>
    (where.id === undefined || p.id === where.id) &&
    (where.roomId === undefined || p.roomId === where.roomId);
  const matchItem = (where) => (i) =>
    (where.id === undefined || i.id === where.id) &&
    (where.playlistId === undefined || i.playlistId === where.playlistId) &&
    (where.playlist?.roomId === undefined ||
      itemInRoom(i, where.playlist.roomId));

  const record = (name, args) => calls.push({ name, args });

  const prisma = {
    calls,
    playlists,
    items,
    seedPlaylist(fields) {
      const p = {
        id: `pl-${++seq}`,
        name: "List",
        description: null,
        createdBy: "someone",
        createdByUsername: null,
        createdAt: new Date(1000 + seq),
        updatedAt: new Date(1000 + seq),
        isDefault: false,
        loop: false,
        shuffle: false,
        autoPlay: true,
        ...fields,
      };
      playlists.push(p);
      return p;
    },
    seedItem(fields) {
      const i = {
        id: `it-${++seq}`,
        title: "Video",
        addedBy: "someone",
        addedByUsername: null,
        addedAt: new Date(2000 + seq),
        duration: null,
        thumbnail: null,
        ...fields,
      };
      if (!i.videoUrl) i.videoUrl = `https://youtu.be/${i.id}`;
      items.push(i);
      return i;
    },
    roomPlaylist: {
      async count({ where }) {
        record("roomPlaylist.count", where);
        return playlists.filter(matchPlaylist(where)).length;
      },
      async create({ data }) {
        record("roomPlaylist.create", data);
        const p = prisma.seedPlaylist(data);
        return p;
      },
      async updateMany({ where, data }) {
        record("roomPlaylist.updateMany", { where, data });
        const hits = playlists.filter(matchPlaylist(where));
        for (const p of hits) Object.assign(p, data);
        return { count: hits.length };
      },
      async deleteMany({ where }) {
        record("roomPlaylist.deleteMany", where);
        let count = 0;
        for (let i = playlists.length - 1; i >= 0; i--) {
          if (matchPlaylist(where)(playlists[i])) {
            playlists.splice(i, 1);
            count++;
          }
        }
        return { count };
      },
      async findFirst({ where }) {
        record("roomPlaylist.findFirst", where);
        const p = playlists.find(matchPlaylist(where));
        return p ? { id: p.id } : null;
      },
      async findUnique({ where }) {
        record("roomPlaylist.findUnique", where);
        if (prisma.onFindUnique) prisma.onFindUnique();
        const p = playlists.find((x) => x.id === where.id);
        return p ? withItems(p) : null;
      },
      async findMany({ where }) {
        record("roomPlaylist.findMany", where);
        return playlists.filter(matchPlaylist(where)).map(withItems);
      },
    },
    roomPlaylistItem: {
      async count({ where }) {
        record("roomPlaylistItem.count", where);
        return items.filter(matchItem(where)).length;
      },
      async findFirst({ where }) {
        record("roomPlaylistItem.findFirst", where);
        const hits = items
          .filter(matchItem(where))
          .sort((a, b) => b.position - a.position);
        return hits[0] ? { position: hits[0].position } : null;
      },
      async create({ data }) {
        record("roomPlaylistItem.create", data);
        return prisma.seedItem(data);
      },
      async deleteMany({ where }) {
        record("roomPlaylistItem.deleteMany", where);
        let count = 0;
        for (let i = items.length - 1; i >= 0; i--) {
          if (matchItem(where)(items[i])) {
            items.splice(i, 1);
            count++;
          }
        }
        return { count };
      },
      async updateMany({ where, data }) {
        record("roomPlaylistItem.updateMany", { where, data });
        const hits = items.filter(matchItem(where));
        for (const i of hits) Object.assign(i, data);
        return { count: hits.length };
      },
    },
    roomState: {
      async upsert(args) {
        record("roomState.upsert", args);
        return {};
      },
    },
    async $transaction(ops) {
      record("$transaction", ops.length);
      return Promise.all(ops);
    },
  };
  return prisma;
}

function createHarness({ rooms = ["room"], dbConnected = true } = {}) {
  const prisma = createFakePrisma();
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
    id: "sock-1",
    rooms: new Set(["sock-1", ...rooms]),
    data: { authUser: { username: "alice" } },
    handlers: new Map(),
    emitted: [],
    on(event, fn) {
      socket.handlers.set(event, fn);
    },
    emit(event, payload) {
      socket.emitted.push({ event, payload });
    },
  };
  const deps = {
    isDbConnected: () => dbConnected,
    getPrisma: () => prisma,
  };
  const state = createSocketState();
  attachPlaylistCrudHandlers(io, state, socket, deps);
  attachPlaylistItemHandlers(io, state, socket, deps);
  attachPlaylistPlaybackHandlers(io, state, socket, deps);
  const fire = (event, payload) => socket.handlers.get(event)(payload);
  const events = (name) => io.relayed.filter((r) => r.event === name);
  const dbCalls = () =>
    prisma.calls.filter((c) => c.name !== "roomState.upsert");
  return { prisma, io, socket, state, fire, events, dbCalls };
}

// Seeds a playlist in "room" with three items a/b/c (positions 0..2).
function seedRoomPlaylist(h, fields = {}) {
  const pl = h.prisma.seedPlaylist({ roomId: "room", ...fields });
  const a = h.prisma.seedItem({ playlistId: pl.id, position: 0, title: "A" });
  const b = h.prisma.seedItem({ playlistId: pl.id, position: 1, title: "B" });
  const c = h.prisma.seedItem({ playlistId: pl.id, position: 2, title: "C" });
  return { pl, a, b, c };
}

function allEventCases(roomId) {
  return [
    ["playlist_get", { roomId }],
    ["playlist_create", { roomId, name: "New" }],
    ["playlist_update", { roomId, playlistId: "pl-x", name: "Renamed" }],
    ["playlist_delete", { roomId, playlistId: "pl-x" }],
    ["playlist_set_active", { roomId, playlistId: null }],
    [
      "playlist_add_item",
      { roomId, playlistId: "pl-x", videoUrl: "https://youtu.be/z" },
    ],
    ["playlist_remove_item", { roomId, playlistId: "pl-x", itemId: "it-x" }],
    [
      "playlist_reorder_items",
      { roomId, playlistId: "pl-x", itemIds: ["it-x"] },
    ],
    ["playlist_play_item", { roomId, playlistId: "pl-x", itemId: "it-x" }],
    ["playlist_next", { roomId }],
    ["playlist_previous", { roomId }],
  ];
}

describe("playlist handlers: membership gating", () => {
  for (const [event, payload] of allEventCases("room")) {
    it(`${event} is refused for a socket that has not joined the room`, async () => {
      const h = createHarness({ rooms: [] });
      h.state.roomPlaylistActive.set("room", {
        activePlaylistId: "pl-x",
        currentItemIndex: 0,
      });
      await h.fire(event, payload);
      assert.deepEqual(h.dbCalls(), []);
      assert.deepEqual(h.io.relayed, []);
      assert.deepEqual(h.socket.emitted, []);
    });
  }

  for (const [event, payload] of allEventCases("sock-1")) {
    it(`${event} is refused when roomId is the caller's own socket id`, async () => {
      const h = createHarness({ rooms: [] });
      h.state.roomPlaylistActive.set("sock-1", {
        activePlaylistId: "pl-x",
        currentItemIndex: 0,
      });
      await h.fire(event, payload);
      assert.deepEqual(h.dbCalls(), []);
      assert.deepEqual(h.io.relayed, []);
      assert.deepEqual(h.socket.emitted, []);
    });
  }

  for (const [event] of allEventCases("room")) {
    it(`${event} tolerates a missing payload`, async () => {
      const h = createHarness();
      await h.fire(event, undefined);
      assert.deepEqual(h.dbCalls(), []);
      assert.deepEqual(h.io.relayed, []);
    });
  }
});

describe("playlist handlers: cross-room playlist ids", () => {
  function crossRoomHarness() {
    const h = createHarness();
    const own = seedRoomPlaylist(h);
    const foreign = h.prisma.seedPlaylist({ roomId: "other", name: "Theirs" });
    const foreignItem = h.prisma.seedItem({
      playlistId: foreign.id,
      position: 0,
      title: "Secret",
    });
    return { h, own, foreign, foreignItem };
  }

  it("playlist_update does not touch another room's playlist", async () => {
    const { h, foreign } = crossRoomHarness();
    await h.fire("playlist_update", {
      roomId: "room",
      playlistId: foreign.id,
      name: "Pwned",
    });
    assert.equal(foreign.name, "Theirs");
    assert.deepEqual(h.events("playlist_state"), []);
  });

  it("playlist_delete does not delete another room's playlist", async () => {
    const { h, foreign } = crossRoomHarness();
    await h.fire("playlist_delete", { roomId: "room", playlistId: foreign.id });
    assert.ok(h.prisma.playlists.includes(foreign));
    assert.deepEqual(h.events("playlist_state"), []);
  });

  it("playlist_set_active refuses another room's playlist", async () => {
    const { h, foreign } = crossRoomHarness();
    await h.fire("playlist_set_active", {
      roomId: "room",
      playlistId: foreign.id,
    });
    assert.equal(h.state.roomPlaylistActive.has("room"), false);
    assert.deepEqual(h.io.relayed, []);
  });

  it("playlist_add_item refuses another room's playlist", async () => {
    const { h, foreign } = crossRoomHarness();
    await h.fire("playlist_add_item", {
      roomId: "room",
      playlistId: foreign.id,
      videoUrl: "https://youtu.be/injected",
    });
    assert.equal(
      h.prisma.items.filter((i) => i.playlistId === foreign.id).length,
      1,
    );
    assert.equal(
      h.prisma.calls.some((c) => c.name === "roomPlaylistItem.create"),
      false,
    );
    assert.deepEqual(h.io.relayed, []);
  });

  it("playlist_remove_item cannot delete an item in another room", async () => {
    const { h, foreign, foreignItem } = crossRoomHarness();
    await h.fire("playlist_remove_item", {
      roomId: "room",
      playlistId: foreign.id,
      itemId: foreignItem.id,
    });
    assert.ok(h.prisma.items.includes(foreignItem));
  });

  it("playlist_reorder_items cannot move items in another room", async () => {
    const { h, foreign, foreignItem } = crossRoomHarness();
    await h.fire("playlist_reorder_items", {
      roomId: "room",
      playlistId: foreign.id,
      itemIds: ["unknown", foreignItem.id],
    });
    assert.equal(foreignItem.position, 0);
  });

  it("playlist_play_item refuses another room's playlist", async () => {
    const { h, foreign, foreignItem } = crossRoomHarness();
    await h.fire("playlist_play_item", {
      roomId: "room",
      playlistId: foreign.id,
      itemId: foreignItem.id,
    });
    assert.equal(h.state.roomPlaylistActive.has("room"), false);
    assert.equal(h.state.roomState.has("room"), false);
    assert.deepEqual(h.io.relayed, []);
  });

  it("playlist_get only returns this room's playlists", async () => {
    const { h, own } = crossRoomHarness();
    await h.fire("playlist_get", { roomId: "room" });
    assert.equal(h.socket.emitted.length, 1);
    const { event, payload } = h.socket.emitted[0];
    assert.equal(event, "playlist_state");
    assert.deepEqual(
      payload.playlists.map((p) => p.id),
      [own.pl.id],
    );
  });
});

describe("playlist_get", () => {
  it("sends the full state to the caller only", async () => {
    const h = createHarness();
    const { pl, a, b, c } = seedRoomPlaylist(h, { loop: true });
    h.state.roomPlaylistActive.set("room", {
      activePlaylistId: pl.id,
      currentItemIndex: 1,
    });
    await h.fire("playlist_get", { roomId: "room" });
    assert.deepEqual(h.io.relayed, []);
    assert.equal(h.socket.emitted.length, 1);
    const { payload } = h.socket.emitted[0];
    assert.equal(payload.roomId, "room");
    assert.equal(payload.activePlaylistId, pl.id);
    assert.equal(payload.currentItemIndex, 1);
    assert.equal(payload.playlists.length, 1);
    assert.deepEqual(payload.playlists[0].settings, {
      loop: true,
      shuffle: false,
      autoPlay: true,
    });
    assert.deepEqual(
      payload.playlists[0].items.map((i) => i.id),
      [a.id, b.id, c.id],
    );
    assert.equal(typeof payload.playlists[0].createdAt, "number");
  });

  it("defaults the active state when none is set", async () => {
    const h = createHarness();
    await h.fire("playlist_get", { roomId: "room" });
    assert.equal(h.socket.emitted[0].payload.activePlaylistId, null);
    assert.equal(h.socket.emitted[0].payload.currentItemIndex, 0);
  });

  it("does not emit if membership is revoked during the query", async () => {
    const h = createHarness();
    const origFindMany = h.prisma.roomPlaylist.findMany;
    h.prisma.roomPlaylist.findMany = async (args) => {
      h.socket.rooms.delete("room");
      return origFindMany(args);
    };
    await h.fire("playlist_get", { roomId: "room" });
    assert.deepEqual(h.socket.emitted, []);
  });
});

describe("playlist_create", () => {
  it("trims and truncates the name and records the creator", async () => {
    const h = createHarness();
    await h.fire("playlist_create", {
      roomId: "room",
      name: `  ${"n".repeat(150)}  `,
      description: "d".repeat(600),
    });
    const [pl] = h.prisma.playlists;
    assert.equal(pl.name, "n".repeat(100));
    assert.equal(pl.description.length, 500);
    assert.equal(pl.createdBy, "sock-1");
    assert.equal(pl.createdByUsername, "alice");
    assert.equal(pl.loop, false);
    assert.equal(pl.shuffle, false);
    assert.equal(pl.autoPlay, true);
    const states = h.events("playlist_state");
    assert.equal(states.length, 1);
    assert.equal(states[0].target, "room");
    assert.equal(states[0].payload.playlists[0].name, "n".repeat(100));
  });

  for (const name of ["", "   ", undefined, 42, null]) {
    it(`rejects name ${JSON.stringify(name)}`, async () => {
      const h = createHarness();
      await h.fire("playlist_create", { roomId: "room", name });
      assert.equal(h.prisma.playlists.length, 0);
      assert.deepEqual(h.io.relayed, []);
    });
  }

  it("does nothing when the database is disconnected", async () => {
    const h = createHarness({ dbConnected: false });
    await h.fire("playlist_create", { roomId: "room", name: "x" });
    assert.deepEqual(h.prisma.calls, []);
    assert.deepEqual(h.io.relayed, []);
  });

  it("falls back to the socket's username map", async () => {
    const h = createHarness();
    h.socket.data = {};
    h.state.socketIdToUsername.set("sock-1", "bob");
    await h.fire("playlist_create", { roomId: "room", name: "x" });
    assert.equal(h.prisma.playlists[0].createdByUsername, "bob");
  });

  // Regression (minor): playlist_create stores `settings.loop/shuffle/autoPlay` with
  // `?? default`, so any non-nullish non-boolean is passed to Prisma verbatim.
  // playlist_update type-checks the same fields. With real Prisma the create
  // throws on a string and the playlist is silently not created instead of
  // falling back to the default. See playlistCrud.js:48-50.
  it("coerces non-boolean settings to defaults on create", async () => {
    const h = createHarness();
    await h.fire("playlist_create", {
      roomId: "room",
      name: "x",
      settings: { loop: "yes", shuffle: 1, autoPlay: "no" },
    });
    const [pl] = h.prisma.playlists;
    assert.equal(pl.loop, false);
    assert.equal(pl.shuffle, false);
    assert.equal(pl.autoPlay, true);
  });
});

describe("playlist_update", () => {
  it("applies only well-typed fields and broadcasts", async () => {
    const h = createHarness();
    const { pl } = seedRoomPlaylist(h);
    await h.fire("playlist_update", {
      roomId: "room",
      playlistId: pl.id,
      name: "  Renamed  ",
      settings: { loop: true, shuffle: "yes", autoPlay: false },
    });
    assert.equal(pl.name, "Renamed");
    assert.equal(pl.loop, true);
    assert.equal(pl.shuffle, false);
    assert.equal(pl.autoPlay, false);
    const states = h.events("playlist_state");
    assert.equal(states.length, 1);
    assert.equal(states[0].target, "room");
  });

  it("does nothing when no valid field is provided", async () => {
    const h = createHarness();
    const { pl } = seedRoomPlaylist(h);
    await h.fire("playlist_update", {
      roomId: "room",
      playlistId: pl.id,
      name: 5,
      settings: { loop: "x" },
    });
    assert.equal(
      h.prisma.calls.some((c) => c.name === "roomPlaylist.updateMany"),
      false,
    );
    assert.deepEqual(h.io.relayed, []);
  });

  it("rejects a non-string playlistId", async () => {
    const h = createHarness();
    await h.fire("playlist_update", {
      roomId: "room",
      playlistId: 7,
      name: "x",
    });
    assert.deepEqual(h.dbCalls(), []);
  });

  // Regression: playlist_update writes `name.trim().slice(0, 100)` without checking
  // that it is non-empty, so a whitespace-only name blanks a playlist that
  // playlist_create would never have allowed. See playlistCrud.js:69-71.
  it("refuses to blank a playlist name with whitespace", async () => {
    const h = createHarness();
    const { pl } = seedRoomPlaylist(h, { name: "Keep me" });
    await h.fire("playlist_update", {
      roomId: "room",
      playlistId: pl.id,
      name: "    ",
    });
    assert.equal(pl.name, "Keep me");
  });
});

describe("playlist_delete", () => {
  it("deletes the playlist and clears it if active", async () => {
    const h = createHarness();
    const { pl } = seedRoomPlaylist(h);
    h.state.roomPlaylistActive.set("room", {
      activePlaylistId: pl.id,
      currentItemIndex: 2,
    });
    await h.fire("playlist_delete", { roomId: "room", playlistId: pl.id });
    assert.equal(h.prisma.playlists.length, 0);
    assert.equal(h.state.roomPlaylistActive.has("room"), false);
    const [st] = h.events("playlist_state");
    assert.deepEqual(st.payload, {
      roomId: "room",
      playlists: [],
      activePlaylistId: null,
      currentItemIndex: 0,
    });
  });

  it("keeps a different active playlist", async () => {
    const h = createHarness();
    const { pl } = seedRoomPlaylist(h);
    const other = h.prisma.seedPlaylist({ roomId: "room" });
    h.state.roomPlaylistActive.set("room", {
      activePlaylistId: pl.id,
      currentItemIndex: 1,
    });
    await h.fire("playlist_delete", { roomId: "room", playlistId: other.id });
    assert.equal(
      h.state.roomPlaylistActive.get("room").activePlaylistId,
      pl.id,
    );
  });

  it("does not broadcast when nothing was deleted", async () => {
    const h = createHarness();
    await h.fire("playlist_delete", { roomId: "room", playlistId: "nope" });
    assert.deepEqual(h.io.relayed, []);
  });
});

describe("playlist_set_active", () => {
  it("sets an own-room playlist active at index 0", async () => {
    const h = createHarness();
    const { pl } = seedRoomPlaylist(h);
    await h.fire("playlist_set_active", { roomId: "room", playlistId: pl.id });
    assert.deepEqual(h.state.roomPlaylistActive.get("room"), {
      activePlaylistId: pl.id,
      currentItemIndex: 0,
    });
    const [st] = h.events("playlist_state");
    assert.equal(st.target, "room");
    assert.equal(st.payload.activePlaylistId, pl.id);
  });

  it("clears the active playlist with null without touching the DB", async () => {
    const h = createHarness({ dbConnected: false });
    h.state.roomPlaylistActive.set("room", {
      activePlaylistId: "pl-old",
      currentItemIndex: 3,
    });
    await h.fire("playlist_set_active", { roomId: "room", playlistId: null });
    assert.deepEqual(h.state.roomPlaylistActive.get("room"), {
      activePlaylistId: null,
      currentItemIndex: 0,
    });
    assert.equal(h.events("playlist_state").length, 1);
  });

  it("refuses an unknown playlist id", async () => {
    const h = createHarness();
    await h.fire("playlist_set_active", { roomId: "room", playlistId: "nope" });
    assert.equal(h.state.roomPlaylistActive.has("room"), false);
  });

  it("refuses when the lookup throws", async () => {
    const h = createHarness();
    h.prisma.roomPlaylist.findFirst = async () => {
      throw new Error("db down");
    };
    await h.fire("playlist_set_active", { roomId: "room", playlistId: "x" });
    assert.equal(h.state.roomPlaylistActive.has("room"), false);
    assert.deepEqual(h.io.relayed, []);
  });
});

describe("playlist_add_item", () => {
  it("appends after the highest position and broadcasts", async () => {
    const h = createHarness();
    const { pl } = seedRoomPlaylist(h);
    await h.fire("playlist_add_item", {
      roomId: "room",
      playlistId: pl.id,
      videoUrl: "https://youtu.be/new",
      title: `  ${"t".repeat(250)}  `,
      duration: 12,
      thumbnail: 5,
    });
    const added = h.prisma.items.at(-1);
    assert.equal(added.position, 3);
    assert.equal(added.title, "t".repeat(200));
    assert.equal(added.duration, 12);
    assert.equal(added.thumbnail, null);
    assert.equal(added.addedBy, "sock-1");
    assert.equal(added.addedByUsername, "alice");
    const [st] = h.events("playlist_state");
    assert.equal(st.payload.playlists[0].items.length, 4);
  });

  it("starts at position 0 in an empty playlist with an Untitled default", async () => {
    const h = createHarness();
    const pl = h.prisma.seedPlaylist({ roomId: "room" });
    await h.fire("playlist_add_item", {
      roomId: "room",
      playlistId: pl.id,
      videoUrl: "https://youtu.be/first",
    });
    const [added] = h.prisma.items;
    assert.equal(added.position, 0);
    assert.equal(added.title, "Untitled");
  });

  it("rejects a missing videoUrl", async () => {
    const h = createHarness();
    const { pl } = seedRoomPlaylist(h);
    await h.fire("playlist_add_item", { roomId: "room", playlistId: pl.id });
    assert.deepEqual(h.dbCalls(), []);
  });
});

describe("playlist_remove_item", () => {
  it("removes the item and broadcasts the new list", async () => {
    const h = createHarness();
    const { pl, a, b, c } = seedRoomPlaylist(h);
    await h.fire("playlist_remove_item", {
      roomId: "room",
      playlistId: pl.id,
      itemId: b.id,
    });
    assert.deepEqual(
      h.prisma.items.map((i) => i.id),
      [a.id, c.id],
    );
    const [st] = h.events("playlist_state");
    assert.equal(st.target, "room");
    assert.deepEqual(
      st.payload.playlists[0].items.map((i) => i.id),
      [a.id, c.id],
    );
  });

  for (const bad of [
    { playlistId: "pl", itemId: 1 },
    { playlistId: 1, itemId: "it" },
    { playlistId: "pl" },
  ]) {
    it(`rejects malformed input ${JSON.stringify(bad)}`, async () => {
      const h = createHarness();
      await h.fire("playlist_remove_item", { roomId: "room", ...bad });
      assert.deepEqual(h.dbCalls(), []);
    });
  }

  // Regression: removing an item never adjusts roomPlaylistActive.currentItemIndex.
  // Removing an item before the playing one leaves the index pointing one
  // past it (here, off the end of the list). See playlistItems.js:62-81.
  it("shifts the active index when an earlier item is removed", async () => {
    const h = createHarness();
    const { pl, a } = seedRoomPlaylist(h);
    h.state.roomPlaylistActive.set("room", {
      activePlaylistId: pl.id,
      currentItemIndex: 2,
    });
    await h.fire("playlist_remove_item", {
      roomId: "room",
      playlistId: pl.id,
      itemId: a.id,
    });
    assert.equal(h.state.roomPlaylistActive.get("room").currentItemIndex, 1);
  });

  // Regression (minor, same room only): the delete is scoped by `playlist.roomId`
  // but ignores `playlistId`, so the named playlist is decorative and an item
  // of a sibling playlist in the same room is removed. See playlistItems.js:72.
  it("does not remove an item from a different playlist", async () => {
    const h = createHarness();
    const { pl } = seedRoomPlaylist(h);
    const other = h.prisma.seedPlaylist({ roomId: "room" });
    const otherItem = h.prisma.seedItem({ playlistId: other.id, position: 0 });
    await h.fire("playlist_remove_item", {
      roomId: "room",
      playlistId: pl.id,
      itemId: otherItem.id,
    });
    assert.ok(h.prisma.items.includes(otherItem));
  });
});

describe("playlist_reorder_items", () => {
  it("writes positions in the given order inside one transaction", async () => {
    const h = createHarness();
    const { pl, a, b, c } = seedRoomPlaylist(h);
    await h.fire("playlist_reorder_items", {
      roomId: "room",
      playlistId: pl.id,
      itemIds: [c.id, a.id, b.id],
    });
    assert.deepEqual([c.position, a.position, b.position], [0, 1, 2]);
    assert.deepEqual(
      h.prisma.calls.filter((x) => x.name === "$transaction"),
      [{ name: "$transaction", args: 3 }],
    );
    const [st] = h.events("playlist_state");
    assert.deepEqual(
      st.payload.playlists[0].items.map((i) => i.id),
      [c.id, a.id, b.id],
    );
  });

  it("keeps the playing item's index in step with the move", async () => {
    const h = createHarness();
    const { pl, a, b, c } = seedRoomPlaylist(h);
    h.state.roomPlaylistActive.set("room", {
      activePlaylistId: pl.id,
      currentItemIndex: 0, // a
    });
    await h.fire("playlist_reorder_items", {
      roomId: "room",
      playlistId: pl.id,
      itemIds: [b.id, c.id, a.id],
    });
    assert.deepEqual(h.state.roomPlaylistActive.get("room"), {
      activePlaylistId: pl.id,
      currentItemIndex: 2,
    });
    assert.equal(h.events("playlist_state")[0].payload.currentItemIndex, 2);
  });

  it("leaves the active index alone for a non-active playlist", async () => {
    const h = createHarness();
    const { pl } = seedRoomPlaylist(h);
    const other = h.prisma.seedPlaylist({ roomId: "room" });
    const x = h.prisma.seedItem({ playlistId: other.id, position: 0 });
    const y = h.prisma.seedItem({ playlistId: other.id, position: 1 });
    h.state.roomPlaylistActive.set("room", {
      activePlaylistId: pl.id,
      currentItemIndex: 1,
    });
    await h.fire("playlist_reorder_items", {
      roomId: "room",
      playlistId: other.id,
      itemIds: [y.id, x.id],
    });
    assert.equal(h.state.roomPlaylistActive.get("room").currentItemIndex, 1);
    assert.equal(
      h.prisma.calls.some((c) => c.name === "roomPlaylist.findUnique"),
      false,
    );
  });

  for (const [label, itemIds] of [
    ["a non-array", "it-1"],
    ["a non-string id", ["it-1", 2]],
    ["more than 500 ids", Array.from({ length: 501 }, (_, i) => `it-${i}`)],
  ]) {
    it(`rejects ${label}`, async () => {
      const h = createHarness();
      await h.fire("playlist_reorder_items", {
        roomId: "room",
        playlistId: "pl",
        itemIds,
      });
      assert.deepEqual(h.dbCalls(), []);
      assert.deepEqual(h.io.relayed, []);
    });
  }

  it("accepts exactly 500 ids", async () => {
    const h = createHarness();
    await h.fire("playlist_reorder_items", {
      roomId: "room",
      playlistId: "pl",
      itemIds: Array.from({ length: 500 }, (_, i) => `id-${i}`),
    });
    assert.deepEqual(
      h.prisma.calls.filter((x) => x.name === "$transaction"),
      [{ name: "$transaction", args: 500 }],
    );
  });

  // Regression (minor, same room only): like remove_item, each updateMany is scoped
  // by `playlist.roomId` but not `playlistId`, so items of a sibling playlist
  // in the same room are repositioned. See playlistItems.js:116-123.
  it("does not move items that belong to a different playlist", async () => {
    const h = createHarness();
    const { pl } = seedRoomPlaylist(h);
    const other = h.prisma.seedPlaylist({ roomId: "room" });
    const x = h.prisma.seedItem({ playlistId: other.id, position: 0 });
    await h.fire("playlist_reorder_items", {
      roomId: "room",
      playlistId: pl.id,
      itemIds: ["missing", x.id],
    });
    assert.equal(x.position, 0);
  });
});

describe("playlist_play_item", () => {
  it("activates the item, broadcasts it and drives room sync", async () => {
    const h = createHarness();
    const { pl, b } = seedRoomPlaylist(h);
    await h.fire("playlist_play_item", {
      roomId: "room",
      playlistId: pl.id,
      itemId: b.id,
    });
    assert.deepEqual(h.state.roomPlaylistActive.get("room"), {
      activePlaylistId: pl.id,
      currentItemIndex: 1,
    });
    const played = h.events("playlist_item_played");
    assert.equal(played.length, 1);
    assert.equal(played[0].target, "room");
    assert.deepEqual(played[0].payload, {
      roomId: "room",
      playlistId: pl.id,
      itemId: b.id,
      itemIndex: 1,
      videoUrl: b.videoUrl,
      title: "B",
    });
    assert.deepEqual(
      h.events("receive_sync").map((e) => e.payload.action),
      ["change_url", "play"],
    );
    assert.equal(h.state.roomState.get("room").videoUrl, b.videoUrl);
    assert.equal(h.events("playlist_state")[0].payload.currentItemIndex, 1);
    const upsert = h.prisma.calls.find((c) => c.name === "roomState.upsert");
    assert.equal(upsert.args.update.activePlaylistId, pl.id);
    assert.equal(upsert.args.update.activePlaylistIdx, 1);
  });

  it("ignores an item that is not in the playlist", async () => {
    const h = createHarness();
    const { pl } = seedRoomPlaylist(h);
    await h.fire("playlist_play_item", {
      roomId: "room",
      playlistId: pl.id,
      itemId: "nope",
    });
    assert.equal(h.state.roomPlaylistActive.has("room"), false);
    assert.deepEqual(h.io.relayed, []);
  });

  it("ignores an unknown playlist", async () => {
    const h = createHarness();
    await h.fire("playlist_play_item", {
      roomId: "room",
      playlistId: "nope",
      itemId: "x",
    });
    assert.deepEqual(h.io.relayed, []);
  });

  it("rejects a non-string itemId", async () => {
    const h = createHarness();
    await h.fire("playlist_play_item", {
      roomId: "room",
      playlistId: "pl",
      itemId: 3,
    });
    assert.deepEqual(h.dbCalls(), []);
  });
});

describe("playlist_next / playlist_previous", () => {
  function activeHarness(fields, index) {
    const h = createHarness();
    const seeded = seedRoomPlaylist(h, fields);
    h.state.roomPlaylistActive.set("room", {
      activePlaylistId: seeded.pl.id,
      currentItemIndex: index,
    });
    return { h, ...seeded };
  }
  const playedIndex = (h) => {
    const played = h.events("playlist_item_played");
    return played.length ? played[0].payload.itemIndex : undefined;
  };

  it("next advances by one and broadcasts the item", async () => {
    const { h, pl, b } = activeHarness({}, 0);
    await h.fire("playlist_next", { roomId: "room" });
    assert.deepEqual(h.events("playlist_item_played")[0].payload, {
      roomId: "room",
      playlistId: pl.id,
      itemId: b.id,
      itemIndex: 1,
      videoUrl: b.videoUrl,
      title: "B",
    });
    assert.equal(h.state.roomPlaylistActive.get("room").currentItemIndex, 1);
    assert.equal(h.state.roomState.get("room").videoUrl, b.videoUrl);
    assert.equal(h.events("playlist_state").length, 1);
  });

  it("next stops at the end of the list without loop", async () => {
    const { h } = activeHarness({ loop: false }, 2);
    await h.fire("playlist_next", { roomId: "room" });
    assert.deepEqual(h.io.relayed, []);
    assert.equal(h.state.roomPlaylistActive.get("room").currentItemIndex, 2);
  });

  it("next wraps to the start with loop", async () => {
    const { h } = activeHarness({ loop: true }, 2);
    await h.fire("playlist_next", { roomId: "room" });
    assert.equal(playedIndex(h), 0);
    assert.equal(h.state.roomPlaylistActive.get("room").currentItemIndex, 0);
  });

  it("next with shuffle but no loop still stops at the end", async (t) => {
    t.mock.method(Math, "random", () => 0);
    const { h } = activeHarness({ shuffle: true, loop: false }, 2);
    await h.fire("playlist_next", { roomId: "room" });
    assert.deepEqual(h.io.relayed, []);
  });

  it("next with shuffle picks a random different index", async (t) => {
    t.mock.method(Math, "random", () => 0.99); // -> index 2
    const { h } = activeHarness({ shuffle: true }, 0);
    await h.fire("playlist_next", { roomId: "room" });
    assert.equal(playedIndex(h), 2);
  });

  it("next with shuffle falls back to current+1 if random keeps repeating", async (t) => {
    t.mock.method(Math, "random", () => 0.5); // -> index 1, the current one
    const { h } = activeHarness({ shuffle: true, loop: true }, 1);
    await h.fire("playlist_next", { roomId: "room" });
    assert.equal(playedIndex(h), 2);
  });

  it("next with shuffle on a single-item looping list replays it", async (t) => {
    t.mock.method(Math, "random", () => 0.7);
    const h = createHarness();
    const pl = h.prisma.seedPlaylist({
      roomId: "room",
      shuffle: true,
      loop: true,
    });
    h.prisma.seedItem({ playlistId: pl.id, position: 0 });
    h.state.roomPlaylistActive.set("room", {
      activePlaylistId: pl.id,
      currentItemIndex: 0,
    });
    await h.fire("playlist_next", { roomId: "room" });
    assert.equal(playedIndex(h), 0);
  });

  it("next does nothing without an active playlist", async () => {
    const h = createHarness();
    await h.fire("playlist_next", { roomId: "room" });
    assert.deepEqual(h.dbCalls(), []);
    assert.deepEqual(h.io.relayed, []);
  });

  it("next does nothing for an empty playlist", async () => {
    const h = createHarness();
    const pl = h.prisma.seedPlaylist({ roomId: "room", loop: true });
    h.state.roomPlaylistActive.set("room", {
      activePlaylistId: pl.id,
      currentItemIndex: 0,
    });
    await h.fire("playlist_next", { roomId: "room" });
    assert.deepEqual(h.io.relayed, []);
  });

  it("next does not double-advance when another next lands mid-query", async () => {
    const { h } = activeHarness({}, 0);
    h.prisma.onFindUnique = () => {
      h.prisma.onFindUnique = null;
      h.state.roomPlaylistActive.set("room", {
        ...h.state.roomPlaylistActive.get("room"),
        currentItemIndex: 1,
      });
    };
    await h.fire("playlist_next", { roomId: "room" });
    assert.deepEqual(h.io.relayed, []);
    assert.equal(h.state.roomPlaylistActive.get("room").currentItemIndex, 1);
  });

  it("previous steps back by one", async () => {
    const { h, a } = activeHarness({}, 1);
    await h.fire("playlist_previous", { roomId: "room" });
    const [played] = h.events("playlist_item_played");
    assert.equal(played.payload.itemIndex, 0);
    assert.equal(played.payload.itemId, a.id);
    assert.equal(played.target, "room");
  });

  it("previous at the start without loop replays the first item", async () => {
    const { h, a } = activeHarness({ loop: false }, 0);
    await h.fire("playlist_previous", { roomId: "room" });
    const [played] = h.events("playlist_item_played");
    assert.equal(played.payload.itemIndex, 0);
    assert.equal(played.payload.itemId, a.id);
  });

  it("previous at the start with loop wraps to the last item", async () => {
    const { h, c } = activeHarness({ loop: true }, 0);
    await h.fire("playlist_previous", { roomId: "room" });
    const [played] = h.events("playlist_item_played");
    assert.equal(played.payload.itemIndex, 2);
    assert.equal(played.payload.itemId, c.id);
  });

  it("previous does not double-step when another lands mid-query", async () => {
    const { h } = activeHarness({}, 2);
    h.prisma.onFindUnique = () => {
      h.state.roomPlaylistActive.set("room", {
        ...h.state.roomPlaylistActive.get("room"),
        currentItemIndex: 1,
      });
    };
    await h.fire("playlist_previous", { roomId: "room" });
    assert.deepEqual(h.io.relayed, []);
  });

  // Regression: when the active index is past the end of the list (reachable because
  // playlist_remove_item never adjusts it), previous computes index-1, reads
  // `playlist.items[prevIndex]` as undefined and throws on `item.id`; the
  // try/catch swallows it, so the button silently does nothing.
  // See playlistPlayback.js:162-177.
  it("previous with a stale out-of-range index clamps to the list", async () => {
    const { h } = activeHarness({}, 5);
    await h.fire("playlist_previous", { roomId: "room" });
    assert.equal(h.events("playlist_item_played").length, 1);
    assert.equal(playedIndex(h), 2);
  });
});
