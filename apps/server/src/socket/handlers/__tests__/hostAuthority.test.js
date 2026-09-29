const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createSocketState } = require("../../state");
const { attachModerationHandlers } = require("../moderation");
const { attachRoomSettingsHandlers } = require("../roomSettings");
const { attachJoinRoomHandler } = require("../joinRoom");
const { attachLeaveRoomHandler } = require("../leaveRoom");
const { isSocketIdRoom } = require("../../helpers/membership");

function createFakeIo() {
  const io = {
    sockets: { adapter: { rooms: new Map() }, sockets: new Map() },
    relayed: [],
    to(target) {
      return {
        emit(event, payload) {
          io.relayed.push({ target, event, payload });
        },
      };
    },
  };
  return io;
}

function createFakeSocket(io, id) {
  const socket = {
    id,
    connected: true,
    rooms: new Set([id]),
    data: {},
    handlers: new Map(),
    emitted: [],
    disconnected: false,
    on(event, fn) {
      socket.handlers.set(event, fn);
    },
    emit(event, payload) {
      socket.emitted.push({ event, payload });
    },
    to() {
      return { emit() {} };
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
    leave(roomId) {
      socket.rooms.delete(roomId);
      io.sockets.adapter.rooms.get(roomId)?.delete(socket.id);
    },
    disconnect() {
      socket.disconnected = true;
    },
  };
  io.sockets.sockets.set(id, socket);
  io.sockets.adapter.rooms.set(id, new Set([id]));
  return socket;
}

const noDbDeps = {
  isDbConnected: () => false,
  getPrisma: () => null,
  hashPassword: async (pw) => `hash:${pw}`,
};

describe("kick_user", () => {
  it("does not disconnect a socket that is not in the host's room", async () => {
    const io = createFakeIo();
    const state = createSocketState();
    const host = createFakeSocket(io, "host");
    const victim = createFakeSocket(io, "victim");
    host.join("own-room");
    victim.join("other-room");
    state.roomHost.set("own-room", "host");
    attachModerationHandlers(io, state, host, noDbDeps);

    await host.handlers.get("kick_user")({
      roomId: "own-room",
      targetId: "victim",
    });

    assert.equal(victim.disconnected, false);
    assert.equal(
      io.relayed.some((r) => r.event === "room_banned"),
      false,
      "a socket outside the room must not be told it was banned",
    );
  });

  it("still kicks a member of the host's room", async () => {
    const io = createFakeIo();
    const state = createSocketState();
    const host = createFakeSocket(io, "host");
    const member = createFakeSocket(io, "member");
    host.join("room");
    member.join("room");
    state.roomHost.set("room", "host");
    attachModerationHandlers(io, state, host, noDbDeps);

    await host.handlers.get("kick_user")({
      roomId: "room",
      targetId: "member",
    });

    assert.equal(member.disconnected, true);
    assert.equal(state.roomBans.get("room").size, 1);
  });
});

describe("host-only handlers after leaving", () => {
  it("an ex-host who left cannot rename the room during the grace window", async () => {
    const io = createFakeIo();
    const state = createSocketState();
    const host = createFakeSocket(io, "host");
    // roomHost survives an emptied room until scheduleRoomCleanup runs, but
    // the socket is no longer a member.
    state.roomHost.set("room", "host");
    attachRoomSettingsHandlers(io, state, host, noDbDeps);

    await host.handlers.get("set_room_name")({ roomId: "room", name: "taken" });

    assert.equal(state.roomName.has("room"), false);
  });

  it("an ex-host who left cannot set a password", async () => {
    const io = createFakeIo();
    const state = createSocketState();
    const host = createFakeSocket(io, "host");
    state.roomHost.set("room", "host");
    attachModerationHandlers(io, state, host, noDbDeps);

    await host.handlers.get("set_room_password")({
      roomId: "room",
      password: "locked",
    });

    assert.equal(state.roomPasswordHash.has("room"), false);
  });
});

describe("join_room with another socket's id", () => {
  it("isSocketIdRoom recognises connected socket ids only", () => {
    const io = createFakeIo();
    createFakeSocket(io, "Abc123_-xyz789ABCDEF");
    assert.equal(isSocketIdRoom(io, "Abc123_-xyz789ABCDEF"), true);
    assert.equal(isSocketIdRoom(io, "real-room"), false);
    assert.equal(isSocketIdRoom(io, ""), false);
    assert.equal(isSocketIdRoom(null, "x"), false);
  });

  it("refuses to join a live socket's private id-room", async () => {
    const io = createFakeIo();
    const state = createSocketState();
    const victimId = "Abc123_-xyz789ABCDEF";
    createFakeSocket(io, victimId);
    const attacker = createFakeSocket(io, "attacker");
    const joinedRooms = new Set();
    attachJoinRoomHandler(io, state, attacker, joinedRooms, {
      ...noDbDeps,
      verifyPassword: async () => true,
    });

    await attacker.handlers.get("join_room")({ roomId: victimId });
    await attacker.data.pendingJoins?.get(victimId);

    assert.equal(attacker.rooms.has(victimId), false);
    assert.equal(joinedRooms.size, 0);
    assert.equal(state.roomHost.has(victimId), false);
  });
});

describe("leave_room game cleanup", () => {
  it("drops the leaver from game participants", async () => {
    const io = createFakeIo();
    const state = createSocketState();
    const player = createFakeSocket(io, "player");
    player.join("room");
    const joinedRooms = new Set(["room"]);
    state.roomGames.set(
      "room",
      new Map([
        [
          "g1",
          {
            id: "g1",
            questioners: [],
            session: {
              status: "lobby",
              participants: ["player", "other"],
              observers: [],
            },
          },
        ],
      ]),
    );
    attachLeaveRoomHandler(io, state, player, joinedRooms, noDbDeps);

    await player.handlers.get("leave_room")({ roomId: "room" });

    assert.deepEqual(
      state.roomGames.get("room").get("g1").session.participants,
      ["other"],
    );
  });
});
