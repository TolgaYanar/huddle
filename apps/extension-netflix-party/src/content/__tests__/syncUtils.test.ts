import { describe, expect, it } from "vitest";

import {
  receiveSyncCarriesPosition,
  resolvePlaybackIntent,
  shouldThrottleApply,
} from "../syncUtils";

describe("resolvePlaybackIntent", () => {
  it("passes through an explicit play/pause intent", () => {
    expect(resolvePlaybackIntent(true)).toBe(true);
    expect(resolvePlaybackIntent(false)).toBe(false);
  });

  it("returns null when the message carries no playback intent", () => {
    // receive_sync omits isPlaying for set_volume / set_mute / set_speed /
    // set_audio_sync. Treating that as `false` made the apply path pause the
    // local Netflix video whenever anyone nudged the volume.
    expect(resolvePlaybackIntent(undefined)).toBe(null);
    expect(resolvePlaybackIntent(null)).toBe(null);
  });

  it("does not coerce truthy or falsy non-booleans", () => {
    for (const value of [1, 0, "true", "", {}, []]) {
      expect(resolvePlaybackIntent(value)).toBe(null);
    }
  });
});

describe("receiveSyncCarriesPosition", () => {
  it("accepts the position-anchoring actions", () => {
    for (const action of ["play", "pause", "seek", "change_url"]) {
      expect(receiveSyncCarriesPosition(action)).toBe(true);
    }
  });

  it("rejects actions whose timestamp is a stale anchor", () => {
    // The server does not re-anchor next.timestamp for these, so the
    // broadcast value is whatever the last play/seek left behind.
    for (const action of [
      "set_volume",
      "set_mute",
      "set_speed",
      "set_audio_sync",
    ]) {
      expect(receiveSyncCarriesPosition(action)).toBe(false);
    }
  });

  it("rejects unknown and non-string actions", () => {
    for (const action of [undefined, null, "", 42, {}]) {
      expect(receiveSyncCarriesPosition(action)).toBe(false);
    }
  });
});

describe("shouldThrottleApply", () => {
  it("throttles a rapid receive_sync", () => {
    expect(shouldThrottleApply("receive_sync", 1000, 900)).toBe(true);
  });

  it("lets a receive_sync through once the window has passed", () => {
    expect(shouldThrottleApply("receive_sync", 1000, 700)).toBe(false);
  });

  it("never throttles an authoritative room_state", () => {
    // The server emits receive_sync and room_state back to back. Throttling
    // both dropped the snapshot that carries the correct isPlaying and an
    // extrapolated timestamp, so a wrong partial apply never self-healed.
    expect(shouldThrottleApply("room_state", 1000, 999)).toBe(false);
    expect(shouldThrottleApply("room_state", 1000, 1000)).toBe(false);
  });

  it("throttles when no source is given (conservative default)", () => {
    expect(shouldThrottleApply(undefined, 1000, 900)).toBe(true);
  });
});
