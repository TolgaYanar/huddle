const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  getEstimatedTimestampForState,
  buildRoomStatePayload,
  anchorRoomStateOnEmpty,
  MAX_EXTRAPOLATION_MS,
} = require("../sync");

// ---------------------------------------------------------------------------
// getEstimatedTimestampForState
// ---------------------------------------------------------------------------
describe("getEstimatedTimestampForState", () => {
  it("returns 0 for null state", () => {
    assert.equal(getEstimatedTimestampForState(null, Date.now()), 0);
  });

  it("returns baseTimestamp when not playing", () => {
    const state = { timestamp: 42, isPlaying: false, updatedAt: Date.now() };
    assert.equal(getEstimatedTimestampForState(state, Date.now()), 42);
  });

  it("advances timestamp when playing", () => {
    const now = Date.now();
    const state = {
      timestamp: 100,
      isPlaying: true,
      updatedAt: now - 5000, // 5 seconds ago
      playbackSpeed: 1,
    };
    const estimated = getEstimatedTimestampForState(state, now);
    // Should be ~105 (100 + 5 seconds elapsed)
    assert.ok(estimated >= 104.9 && estimated <= 105.1, `Expected ~105, got ${estimated}`);
  });

  it("respects playback speed", () => {
    const now = Date.now();
    const state = {
      timestamp: 0,
      isPlaying: true,
      updatedAt: now - 4000, // 4 seconds ago at 2x speed
      playbackSpeed: 2,
    };
    const estimated = getEstimatedTimestampForState(state, now);
    // 4s elapsed × 2 = 8s
    assert.ok(estimated >= 7.9 && estimated <= 8.1, `Expected ~8, got ${estimated}`);
  });

  it("never returns a negative timestamp when updatedAt is in the future", () => {
    const now = Date.now();
    const state = {
      timestamp: 10,
      isPlaying: true,
      updatedAt: now + 5000, // somehow in the future
      playbackSpeed: 1,
    };
    const estimated = getEstimatedTimestampForState(state, now);
    // elapsed = max(0, ...) so result should equal baseTimestamp
    assert.equal(estimated, 10);
  });

  it("defaults playbackSpeed to 1 when missing", () => {
    const now = Date.now();
    const state = {
      timestamp: 50,
      isPlaying: true,
      updatedAt: now - 3000,
      // no playbackSpeed
    };
    const estimated = getEstimatedTimestampForState(state, now);
    assert.ok(estimated >= 52.9 && estimated <= 53.1, `Expected ~53, got ${estimated}`);
  });

  it("returns baseTimestamp when isPlaying is absent", () => {
    const state = { timestamp: 99 };
    assert.equal(getEstimatedTimestampForState(state, Date.now()), 99);
  });

  it("returns baseTimestamp when playing but stale beyond the extrapolation cap", () => {
    const now = Date.now();
    const state = {
      timestamp: 120,
      isPlaying: true,
      // 7 hours of silence — well past the 6h cap.
      updatedAt: now - (MAX_EXTRAPOLATION_MS + 60 * 60 * 1000),
      playbackSpeed: 1,
    };
    // Without the cap this would extrapolate to ~25,320s.
    assert.equal(getEstimatedTimestampForState(state, now), 120);
  });

  it("still extrapolates a playing state with a small delta just under the cap", () => {
    const now = Date.now();
    const state = {
      timestamp: 10,
      isPlaying: true,
      updatedAt: now - 5000, // 5s ago, well within the cap
      playbackSpeed: 1,
    };
    const estimated = getEstimatedTimestampForState(state, now);
    assert.ok(estimated >= 14.9 && estimated <= 15.1, `Expected ~15, got ${estimated}`);
  });
});

// ---------------------------------------------------------------------------
// buildRoomStatePayload
// ---------------------------------------------------------------------------
describe("buildRoomStatePayload", () => {
  it("includes roomId and serverNow", () => {
    const now = Date.now();
    const result = buildRoomStatePayload("room1", null, now);
    assert.equal(result.roomId, "room1");
    assert.equal(result.serverNow, now);
  });

  it("defaults isPlaying to false when state is null", () => {
    const result = buildRoomStatePayload("room1", null, Date.now());
    assert.equal(result.isPlaying, false);
  });

  it("defaults rev to 0 when state is null", () => {
    const result = buildRoomStatePayload("room1", null, Date.now());
    assert.equal(result.rev, 0);
  });

  it("preserves state fields", () => {
    const now = Date.now();
    const state = {
      videoUrl: "https://youtube.com/watch?v=abc",
      isPlaying: true,
      volume: 0.8,
      isMuted: false,
      playbackSpeed: 1.5,
      rev: 7,
      timestamp: 30,
      updatedAt: now,
    };
    const result = buildRoomStatePayload("room42", state, now);
    assert.equal(result.videoUrl, state.videoUrl);
    assert.equal(result.isPlaying, true);
    assert.equal(result.volume, 0.8);
    assert.equal(result.rev, 7);
    assert.equal(result.playbackSpeed, 1.5);
  });

  it("overrides timestamp with estimated value when playing", () => {
    const now = Date.now();
    const state = {
      timestamp: 20,
      isPlaying: true,
      updatedAt: now - 2000, // 2 seconds elapsed
      playbackSpeed: 1,
      rev: 1,
    };
    const result = buildRoomStatePayload("r", state, now);
    // estimated ≈ 22
    assert.ok(result.timestamp >= 21.9 && result.timestamp <= 22.1, `Expected ~22, got ${result.timestamp}`);
  });

  it("does not advance timestamp when paused", () => {
    const now = Date.now();
    const state = {
      timestamp: 50,
      isPlaying: false,
      updatedAt: now - 10_000,
      playbackSpeed: 1,
      rev: 2,
    };
    const result = buildRoomStatePayload("r", state, now);
    assert.equal(result.timestamp, 50);
  });

  it("handles non-finite rev gracefully", () => {
    const state = { rev: NaN, isPlaying: false };
    const result = buildRoomStatePayload("r", state, Date.now());
    assert.equal(result.rev, 0);
  });
});

// ---------------------------------------------------------------------------
// anchorRoomStateOnEmpty
// ---------------------------------------------------------------------------
describe("anchorRoomStateOnEmpty", () => {
  function makeState(roomState) {
    const map = new Map();
    if (roomState) map.set("room1", roomState);
    return { roomState: map };
  }

  it("anchors a playing room to its estimated position, paused, rev bumped", () => {
    const now = Date.now();
    const state = makeState({
      videoUrl: "https://youtube.com/watch?v=abc",
      timestamp: 100,
      isPlaying: true,
      updatedAt: now - 5000, // 5s elapsed
      playbackSpeed: 1,
      rev: 4,
    });

    const result = anchorRoomStateOnEmpty(state, "room1");
    assert.ok(result, "expected an anchored state");
    assert.equal(result.isPlaying, false);
    assert.equal(result.action, "pause");
    assert.equal(result.rev, 5);
    // Anchored ~ original + 5s of elapsed playback.
    assert.ok(result.timestamp >= 104.9 && result.timestamp <= 105.1, `Expected ~105, got ${result.timestamp}`);
    // Preserves unrelated fields.
    assert.equal(result.videoUrl, "https://youtube.com/watch?v=abc");
    // Stored back into the map.
    assert.equal(state.roomState.get("room1"), result);
  });

  it("returns null when there is no prior state", () => {
    const state = makeState(null);
    assert.equal(anchorRoomStateOnEmpty(state, "room1"), null);
  });

  it("does not advance an already-paused room and still bumps rev", () => {
    const now = Date.now();
    const state = makeState({
      timestamp: 50,
      isPlaying: false,
      updatedAt: now - 60_000,
      rev: 2,
    });
    const result = anchorRoomStateOnEmpty(state, "room1");
    assert.equal(result.timestamp, 50);
    assert.equal(result.isPlaying, false);
    assert.equal(result.rev, 3);
  });
});
