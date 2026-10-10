const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createSocketState } = require("../../state");
const { attachWebRTCHandlers } = require("../webrtc");

const ROOM = "mesh-room";
const OFFER = { type: "offer", sdp: "v=0\r\n" };
const ANSWER = { type: "answer", sdp: "v=0\r\n" };

function createMeshHarness(peerCount) {
  const peers = Array.from({ length: peerCount }, (_, i) => `peer-${i}`);
  const relayed = [];
  const socket = {
    id: "sender",
    rooms: new Set(["sender", ROOM]),
    data: {},
    handlers: new Map(),
    on(event, handler) {
      this.handlers.set(event, handler);
    },
    to() {
      return { emit() {} };
    },
  };
  const io = {
    sockets: {
      adapter: { rooms: new Map([[ROOM, new Set([socket.id, ...peers])]]) },
    },
    to(target) {
      return {
        emit(event, payload) {
          relayed.push({ target, event, payload });
        },
      };
    },
  };
  attachWebRTCHandlers(io, createSocketState(), socket, {
    getPrisma: () => null,
  });
  const send = (event, to, sdp) =>
    socket.handlers.get(event)({ roomId: ROOM, to, sdp });
  return { peers, relayed, send };
}

describe("WebRTC description relay budget", () => {
  it("relays a whole mesh renegotiating at once", () => {
    // Six people turning on their microphones together: seven descriptions to
    // each of five peers inside one window. A single 30/10 s budget shared by
    // every peer dropped the last five, and those pairs never got an answer.
    const { peers, relayed, send } = createMeshHarness(5);
    for (let round = 0; round < 7; round++) {
      for (const peer of peers) send("webrtc_offer", peer, OFFER);
    }
    assert.equal(relayed.length, 35);
  });

  it("still bounds what a single peer can be sent", () => {
    const { peers, relayed, send } = createMeshHarness(1);
    for (let i = 0; i < 31; i++) send("webrtc_offer", peers[0], OFFER);
    assert.equal(relayed.length, 30);
  });

  it("counts offers and answers to the same peer against one budget", () => {
    const { peers, relayed, send } = createMeshHarness(1);
    for (let i = 0; i < 20; i++) send("webrtc_offer", peers[0], OFFER);
    for (let i = 0; i < 20; i++) send("webrtc_answer", peers[0], ANSWER);
    assert.equal(relayed.length, 30);
  });

  it("caps the total one socket can make the server relay", () => {
    const { peers, relayed, send } = createMeshHarness(10);
    for (let round = 0; round < 13; round++) {
      for (const peer of peers) send("webrtc_offer", peer, OFFER);
    }
    assert.equal(relayed.length, 120);
  });
});
