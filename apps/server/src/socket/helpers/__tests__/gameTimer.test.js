const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseTurnTimer,
  MIN_TURN_TIMER_S,
  MAX_TURN_TIMER_S,
} = require("../gameTimer");

test("parseTurnTimer returns null for off/invalid", () => {
  assert.equal(parseTurnTimer(null), null);
  assert.equal(parseTurnTimer(undefined), null);
  assert.equal(parseTurnTimer(0), null);
  assert.equal(parseTurnTimer(-5), null);
  assert.equal(parseTurnTimer("nope"), null);
  assert.equal(parseTurnTimer(NaN), null);
});

test("parseTurnTimer floors floats", () => {
  assert.equal(parseTurnTimer(20.7), 20);
  assert.equal(parseTurnTimer("30"), 30);
});

test("parseTurnTimer clamps to allowed range", () => {
  assert.equal(parseTurnTimer(1), MIN_TURN_TIMER_S);
  assert.equal(parseTurnTimer(MIN_TURN_TIMER_S - 1), MIN_TURN_TIMER_S);
  assert.equal(parseTurnTimer(MAX_TURN_TIMER_S + 100), MAX_TURN_TIMER_S);
  assert.equal(parseTurnTimer(60), 60);
});
