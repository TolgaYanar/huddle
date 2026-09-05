const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createSocketState } = require("../../state");
const { attachWebRTCHandlers } = require("../webrtc");

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function createHarness() {
  const relayed = [];
  const roomBroadcasts = [];
  const roomId = "voice-room";
  const socket = {
    id: "speaker",
    rooms: new Set(["speaker", roomId]),
    data: {},
    handlers: new Map(),
    on(event, handler) {
      this.handlers.set(event, handler);
    },
    to(target) {
      assert.equal(target, roomId);
      return {
        emit(event, payload) {
          relayed.push({ event, payload });
        },
      };
    },
  };
  const io = {
    sockets: {
      adapter: { rooms: new Map([[roomId, new Set([socket.id, "listener"])]]) },
    },
    to(target) {
      assert.equal(target, roomId);
      return {
        emit(event, payload) {
          roomBroadcasts.push({ event, payload });
        },
      };
    },
  };
  const writes = [deferred(), deferred()];
  const writeTexts = [];
  let nextWrite = 0;
  const deps = {
    getPrisma: () => ({
      roomMessage: {
        create({ data }) {
          writeTexts.push(data.text);
          return writes[nextWrite++].promise;
        },
      },
    }),
  };
  const state = createSocketState();
  attachWebRTCHandlers(io, state, socket, deps);
  return {
    roomId,
    socket,
    relayed,
    roomBroadcasts,
    state,
    writes,
    writeTexts,
    getWriteCount: () => nextWrite,
  };
}

describe("WebRTC media state relay ordering", () => {
  it("never drops the final authoritative state when audit events are rate-limited", () => {
    const { roomId, socket, relayed, state } = createHarness();
    const handler = socket.handlers.get("webrtc_media_state");

    for (let index = 0; index < 5; index += 1) {
      handler({ roomId, state: { mic: false, cam: true, screen: false } });
    }
    handler({ roomId, state: { mic: false, cam: false, screen: false } });

    assert.equal(relayed.length, 6);
    assert.deepEqual(relayed.at(-1).payload.state, {
      mic: false,
      cam: false,
      screen: false,
    });
    assert.deepEqual(state.roomMediaState.get(roomId).get(socket.id), {
      mic: false,
      cam: false,
      screen: false,
    });
  });

  it("broadcasts each state immediately and in arrival order before DB chat writes settle", async () => {
    const {
      roomId,
      socket,
      relayed,
      roomBroadcasts,
      state,
      writes,
      writeTexts,
      getWriteCount,
    } = createHarness();

    const micOn = socket.handlers.get("webrtc_media_state")({
      roomId,
      state: { mic: true, cam: false, screen: false },
    });
    const micOff = socket.handlers.get("webrtc_media_state")({
      roomId,
      state: { mic: false, cam: false, screen: false },
    });

    assert.deepEqual(
      relayed.map(({ event, payload }) => [event, payload.state]),
      [
        ["webrtc_media_state", { mic: true, cam: false, screen: false }],
        ["webrtc_media_state", { mic: false, cam: false, screen: false }],
      ],
      "latency-sensitive state must not wait for either system-chat write",
    );
    assert.deepEqual(state.roomMediaState.get(roomId).get(socket.id), {
      mic: false,
      cam: false,
      screen: false,
    });

    // The second audit write must not start while the first is unresolved,
    // but neither write is allowed to delay the media relay asserted above.
    await Promise.resolve();
    assert.equal(getWriteCount(), 1);
    writes[0].resolve({
      id: "m1",
      roomId,
      senderId: "system",
      text: "on",
      createdAt: new Date(),
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(getWriteCount(), 2);
    assert.match(writeTexts[0], /turned mic on$/);
    assert.match(writeTexts[1], /turned mic off$/);
    writes[1].resolve({
      id: "m2",
      roomId,
      senderId: "system",
      text: "off",
      createdAt: new Date(),
    });
    await Promise.all([micOn, micOff]);

    assert.deepEqual(
      relayed
        .filter(({ event }) => event === "webrtc_media_state")
        .map(({ payload }) => payload.state.mic),
      [true, false],
    );
    assert.deepEqual(
      roomBroadcasts
        .filter(({ event }) => event === "chat_message")
        .map(({ payload }) => payload.text),
      ["on", "off"],
      "audit messages should preserve the same arrival order as media state",
    );
  });
});
