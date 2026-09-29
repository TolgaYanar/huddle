import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useYouTubePlayerSync } from "../useYouTubePlayerSync";
import type { YouTubeIFrameLatest } from "../internalTypes";
import type { YTPlayer } from "../types";

function ref<T>(current: T) {
  return { current };
}

function setup() {
  const player = {
    mute: vi.fn(),
    unMute: vi.fn(),
    setVolume: vi.fn(),
    setPlaybackRate: vi.fn(),
    loadVideoById: vi.fn(),
    cueVideoById: vi.fn(),
    playVideo: vi.fn(),
    pauseVideo: vi.fn(),
    // Stuck in CUED: never reaches PLAYING (1).
    getPlayerState: vi.fn(() => 5),
    getCurrentTime: vi.fn(() => 0),
  } as unknown as YTPlayer;
  const latest = ref({ playing: true } as YouTubeIFrameLatest);
  const setResetNonce = vi.fn();
  const stable = {
    startTime: null,
    playbackRate: 1,
    playerRef: ref<YTPlayer | null>(player),
    latest,
    lastStateRef: ref<number | null>(null),
    lastCommandedPlayingRef: ref<boolean | null>(null),
    lastCommandedVideoIdRef: ref<string | null>(null),
    lastRequestedVideoIdRef: ref<string | null>(null),
    lastVideoSwitchAtRef: ref(0),
    lastEnsurePlayAtRef: ref(0),
    kickWindowUntilRef: ref(0),
    kickAttemptsRef: ref(0),
    kickVideoIdRef: ref<string | null>(null),
    startTimeFallbackTriedForVideoRef: ref<string | null>(null),
    lastHardResetVideoIdRef: ref<string | null>(null),
    usedStartTimeForVideoRef: ref<string | null>(null),
    setResetNonce,
  };
  const hook = renderHook(
    (p: { videoId: string; volume: number }) =>
      useYouTubePlayerSync({
        ...stable,
        videoId: p.videoId,
        volume: p.volume,
        playing: true,
        muted: false,
      }),
    { initialProps: { videoId: "vid-1", volume: 1 } },
  );
  return { ...hook, setResetNonce };
}

describe("useYouTubePlayerSync wedge recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("still recreates a wedged player when the volume changes after a switch", () => {
    const { rerender, setResetNonce } = setup();

    // Volume nudged 2 s into the switch re-runs the sync effect.
    vi.advanceTimersByTime(2000);
    rerender({ videoId: "vid-1", volume: 0.5 });

    vi.advanceTimersByTime(8500);
    expect(setResetNonce).toHaveBeenCalledOnce();
  });

  it("does not fire an old video's recovery after switching away", () => {
    const { rerender, setResetNonce } = setup();
    rerender({ videoId: "vid-2", volume: 1 });
    vi.advanceTimersByTime(9000);
    // vid-1's timer was cleared on the switch; vid-2's has not elapsed yet.
    expect(setResetNonce).not.toHaveBeenCalled();
  });

  it("clears pending recovery on unmount", () => {
    const { unmount, setResetNonce } = setup();
    unmount();
    vi.advanceTimersByTime(20_000);
    expect(setResetNonce).not.toHaveBeenCalled();
  });
});
