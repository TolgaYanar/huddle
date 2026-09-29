const { describe, it, mock, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { createSocketState, cleanupRoom } = require("../../state");
const { settleTimer, getRoomTimer } = require("../timer");
const { attachTimerHandlers } = require("../../handlers/timer");

function harness() {
  const io = {
    sockets: { adapter: { rooms: new Map() } },
    emitted: [],
    to() {
      return { emit: (event, payload) => io.emitted.push({ event, payload }) };
    },
  };
  const state = createSocketState();
  const handlers = new Map();
  const socket = {
    id: "member",
    rooms: new Set(["member", "room"]),
    on: (event, fn) => handlers.set(event, fn),
    emit() {},
  };
  attachTimerHandlers(io, state, socket);
  return { io, state, handlers };
}

describe("room timer", () => {
  afterEach(() => {
    mock.timers.reset();
  });

  it("settleTimer marks an expired running timer finished", () => {
    const timer = { status: "running", endsAt: 1000, remainingMs: 500 };
    settleTimer(timer, 999);
    assert.equal(timer.status, "running");
    settleTimer(timer, 1000);
    assert.equal(timer.status, "finished");
    assert.equal(timer.remainingMs, 0);
    assert.equal(timer.endsAt, null);
  });

  it("broadcasts finished when time runs out, without anyone acting", () => {
    mock.timers.enable({ apis: ["setTimeout", "Date"] });
    const { io, state, handlers } = harness();
    handlers.get("timer_set_duration")({ roomId: "room", durationMs: 5000 });
    handlers.get("timer_start")({ roomId: "room" });
    io.emitted.length = 0;

    mock.timers.tick(5000);

    assert.equal(io.emitted.length, 1);
    assert.equal(io.emitted[0].payload.status, "finished");
    assert.equal(getRoomTimer(state, "room").status, "finished");
  });

  it("does not fire after a pause", () => {
    mock.timers.enable({ apis: ["setTimeout", "Date"] });
    const { io, handlers } = harness();
    handlers.get("timer_set_duration")({ roomId: "room", durationMs: 5000 });
    handlers.get("timer_start")({ roomId: "room" });
    mock.timers.tick(1000);
    handlers.get("timer_pause")({ roomId: "room" });
    io.emitted.length = 0;

    mock.timers.tick(10_000);

    assert.equal(io.emitted.length, 0);
  });

  it("does not recreate a room's timer after the room was cleaned up", () => {
    mock.timers.enable({ apis: ["setTimeout", "Date"] });
    const { io, state, handlers } = harness();
    handlers.get("timer_start")({ roomId: "room" });
    cleanupRoom(io, state, "room");

    mock.timers.tick(30 * 60 * 1000);

    assert.equal(state.roomTimer.has("room"), false);
  });
});
