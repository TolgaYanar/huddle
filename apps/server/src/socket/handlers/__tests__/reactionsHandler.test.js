const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createSocketState } = require("../../state");
const { attachReactionHandlers } = require("../reactions");

function createHarness({ id = "sock-1", rooms = ["room"], state } = {}) {
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
  const st = state || createSocketState();
  attachReactionHandlers(io, st, socket);
  const react = (payload) => socket.handlers.get("add_reaction")(payload);
  return { io, socket, state: st, react };
}

describe("add_reaction", () => {
  it("adds a reaction and broadcasts the serialized map to the room", () => {
    const h = createHarness();
    h.react({ roomId: "room", messageId: "m1", emoji: "👍" });
    assert.deepEqual(h.io.relayed, [
      {
        target: "room",
        event: "reaction_updated",
        payload: { messageId: "m1", reactions: { "👍": ["sock-1"] } },
      },
    ]);
    assert.ok(h.state.roomReactions.get("room").get("m1")["👍"].has("sock-1"));
  });

  it("toggles the same reaction off and drops the empty emoji key", () => {
    const h = createHarness();
    h.react({ roomId: "room", messageId: "m1", emoji: "🔥" });
    h.react({ roomId: "room", messageId: "m1", emoji: "🔥" });
    assert.equal(h.io.relayed.length, 2);
    assert.deepEqual(h.io.relayed[1].payload, {
      messageId: "m1",
      reactions: {},
    });
  });

  it("merges reactions from several members and emojis", () => {
    const state = createSocketState();
    const a = createHarness({ id: "a", state });
    const b = createHarness({ id: "b", state });
    a.react({ roomId: "room", messageId: "m1", emoji: "👍" });
    b.react({ roomId: "room", messageId: "m1", emoji: "👍" });
    b.react({ roomId: "room", messageId: "m1", emoji: "😂" });
    assert.deepEqual(b.io.relayed.at(-1).payload, {
      messageId: "m1",
      reactions: { "👍": ["a", "b"], "😂": ["b"] },
    });
  });

  it("keeps reactions per room separate", () => {
    const state = createSocketState();
    const h = createHarness({ rooms: ["r1", "r2"], state });
    h.react({ roomId: "r1", messageId: "m1", emoji: "👍" });
    h.react({ roomId: "r2", messageId: "m1", emoji: "😮" });
    assert.deepEqual(h.io.relayed[1], {
      target: "r2",
      event: "reaction_updated",
      payload: { messageId: "m1", reactions: { "😮": ["sock-1"] } },
    });
  });

  it("is refused for a socket that has not joined the room", () => {
    const h = createHarness({ rooms: [] });
    h.react({ roomId: "room", messageId: "m1", emoji: "👍" });
    assert.deepEqual(h.io.relayed, []);
    assert.equal(h.state.roomReactions.size, 0);
  });

  it("is refused when roomId is the caller's own socket id", () => {
    const h = createHarness({ rooms: [] });
    h.react({ roomId: "sock-1", messageId: "m1", emoji: "👍" });
    assert.deepEqual(h.io.relayed, []);
    assert.equal(h.state.roomReactions.size, 0);
  });

  for (const [label, payload] of [
    ["a missing payload", undefined],
    ["a non-string roomId", { roomId: 1, messageId: "m1", emoji: "👍" }],
    ["a missing messageId", { roomId: "room", emoji: "👍" }],
    ["a non-string messageId", { roomId: "room", messageId: 5, emoji: "👍" }],
    [
      "a messageId over 64 chars",
      { roomId: "room", messageId: "m".repeat(65), emoji: "👍" },
    ],
    [
      "an emoji outside the allow-list",
      { roomId: "room", messageId: "m1", emoji: "🎉" },
    ],
    [
      "arbitrary text as emoji",
      { roomId: "room", messageId: "m1", emoji: "<b>x</b>" },
    ],
    ["a missing emoji", { roomId: "room", messageId: "m1" }],
  ]) {
    it(`rejects ${label}`, () => {
      const h = createHarness();
      h.react(payload);
      assert.deepEqual(h.io.relayed, []);
      assert.equal(h.state.roomReactions.size, 0);
    });
  }

  it("accepts a messageId of exactly 64 chars", () => {
    const h = createHarness();
    h.react({ roomId: "room", messageId: "m".repeat(64), emoji: "👍" });
    assert.equal(h.io.relayed.length, 1);
  });

  it("rate-limits to 20 toggles per window", () => {
    const h = createHarness();
    for (let i = 0; i < 25; i++) {
      h.react({ roomId: "room", messageId: `m${i}`, emoji: "👍" });
    }
    assert.equal(h.io.relayed.length, 20);
    assert.equal(h.state.roomReactions.get("room").size, 20);
  });

  it("does not spend rate-limit budget on rejected input", () => {
    const h = createHarness();
    for (let i = 0; i < 30; i++) {
      h.react({ roomId: "room", messageId: "m1", emoji: "🎉" });
    }
    h.react({ roomId: "room", messageId: "m1", emoji: "👍" });
    assert.equal(h.io.relayed.length, 1);
  });
});
