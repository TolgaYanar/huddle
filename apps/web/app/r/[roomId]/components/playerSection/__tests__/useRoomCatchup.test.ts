import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { USER_PAUSE_INTENT_WINDOW_MS } from "../../../hooks/useVideoPlayer/constants";
import { useRoomCatchup, type RoomPlaybackAnchor } from "../useRoomCatchup";
import { holdRemoteSyncGuard } from "../../../lib/remoteSyncGuard";

const telemetry = vi.hoisted(() => ({
  record: vi.fn(),
  recordDrift: vi.fn(),
  setPlatform: vi.fn(),
  flush: vi.fn(),
}));

vi.mock("../../../hooks/useSyncTelemetry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../hooks/useSyncTelemetry")>()),
  useSyncTelemetry: () => telemetry,
}));

const URL_A = "https://www.youtube.com/watch?v=aaa";
const URL_B = "https://www.youtube.com/watch?v=bbb";
const T0 = 1_700_000_000_000;

type FakeInternal = {
  seekTo: ReturnType<typeof vi.fn>;
  playVideo?: ReturnType<typeof vi.fn>;
};

function makePlayer(initialTime = 0, withInternalPlayVideo = true) {
  const state = { time: initialTime };
  const internal: FakeInternal = { seekTo: vi.fn() };
  if (withInternalPlayVideo) internal.playVideo = vi.fn();
  const player = {
    getCurrentTime: vi.fn(() => state.time),
    seekTo: vi.fn(),
    playVideo: vi.fn(),
    getInternalPlayer: () => internal,
  };
  return { player, internal, state };
}

type Props = {
  isClient: boolean;
  playerReady: boolean;
  normalizedUrl: string;
  duration: number;
  videoState: string;
  roomPlaybackAnchorVersion: number;
};

function setup(
  opts: {
    anchor?: RoomPlaybackAnchor | null;
    time?: number;
    props?: Partial<Props>;
    playerCurrent?: unknown;
    withInternalPlayVideo?: boolean;
  } = {},
) {
  const { player, internal, state } = makePlayer(
    opts.time ?? 0,
    opts.withInternalPlayVideo ?? true,
  );
  const playerRef = {
    current: "playerCurrent" in opts ? opts.playerCurrent : player,
  };
  const applyingRemoteSyncRef = { current: false };
  const roomPlaybackAnchorRef = {
    current: opts.anchor === undefined ? null : opts.anchor,
  };
  const lastManualSeekRef = { current: 0 };
  const lastUserPauseAtRef = { current: 0 };
  const suppressNextPlayBroadcast = vi.fn();
  const suppressNextSeekBroadcast = vi.fn();
  const handlePlay = vi.fn();
  const handleSeekTo = vi.fn();

  const initialProps: Props = {
    isClient: true,
    playerReady: false,
    normalizedUrl: URL_A,
    duration: 0,
    videoState: "playing",
    roomPlaybackAnchorVersion: 0,
    ...opts.props,
  };

  const hook = renderHook(
    (p: Props) =>
      useRoomCatchup({
        ...p,
        playerRef,
        applyingRemoteSyncRef,
        roomPlaybackAnchorRef,
        lastManualSeekRef,
        lastUserPauseAtRef,
        suppressNextPlayBroadcast,
        suppressNextSeekBroadcast,
        handlePlay,
        handleSeekTo,
      }),
    { initialProps },
  );

  return {
    ...hook,
    initialProps,
    player,
    internal,
    state,
    playerRef,
    applyingRemoteSyncRef,
    roomPlaybackAnchorRef,
    lastManualSeekRef,
    lastUserPauseAtRef,
    suppressNextPlayBroadcast,
    suppressNextSeekBroadcast,
    handlePlay,
    handleSeekTo,
  };
}

function anchor(over: Partial<RoomPlaybackAnchor> = {}): RoomPlaybackAnchor {
  return {
    url: URL_A,
    isPlaying: true,
    anchorTime: 0,
    // Old enough that the "recent anchor" skip does not apply by default.
    anchorAt: Date.now() - 60_000,
    playbackRate: 1,
    ...over,
  };
}

/** Anchor whose extrapolated position right now is exactly `pos`. */
function pausedAt(pos: number, over: Partial<RoomPlaybackAnchor> = {}) {
  return anchor({ isPlaying: false, anchorTime: pos, ...over });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  telemetry.record.mockClear();
  telemetry.recordDrift.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useRoomCatchup: effect gating", () => {
  it("does nothing while isClient is false", () => {
    const h = setup({
      anchor: pausedAt(100),
      time: 50,
      props: { isClient: false, playerReady: true },
    });
    vi.advanceTimersByTime(1000);
    expect(h.player.seekTo).not.toHaveBeenCalled();
    expect(telemetry.recordDrift).not.toHaveBeenCalled();
  });

  it("defers until playerReady, then syncs 50 ms later", () => {
    const h = setup({ anchor: pausedAt(100), time: 50 });
    vi.advanceTimersByTime(1000);
    expect(h.player.seekTo).not.toHaveBeenCalled();

    h.rerender({ ...h.initialProps, playerReady: true });
    vi.advanceTimersByTime(49);
    expect(h.player.seekTo).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(h.player.seekTo).toHaveBeenCalledWith(100, "seconds");
  });

  it("cancels the scheduled sync when unmounted within the 50 ms delay", () => {
    const h = setup({
      anchor: pausedAt(100),
      time: 50,
      props: { playerReady: true },
    });
    h.unmount();
    vi.advanceTimersByTime(100);
    expect(h.player.seekTo).not.toHaveBeenCalled();
    expect(telemetry.recordDrift).not.toHaveBeenCalled();
  });

  it.each([
    ["roomPlaybackAnchorVersion", { roomPlaybackAnchorVersion: 1 }],
    ["videoState", { videoState: "paused" }],
  ] as const)("re-runs the sync when %s changes", (_name, change) => {
    const h = setup({
      anchor: pausedAt(10),
      time: 10,
      props: { playerReady: true },
    });
    vi.advanceTimersByTime(50);
    expect(telemetry.recordDrift).toHaveBeenCalledTimes(1);

    h.rerender({ ...h.initialProps, ...change });
    vi.advanceTimersByTime(50);
    expect(telemetry.recordDrift).toHaveBeenCalledTimes(2);
  });

  it("re-runs on normalizedUrl change and syncs once the anchor URL matches", () => {
    const h = setup({
      anchor: pausedAt(100, { url: URL_B }),
      time: 50,
      props: { playerReady: true },
    });
    vi.advanceTimersByTime(50);
    expect(telemetry.recordDrift).not.toHaveBeenCalled();

    h.rerender({ ...h.initialProps, normalizedUrl: URL_B });
    vi.advanceTimersByTime(50);
    expect(h.player.seekTo).toHaveBeenCalledWith(100, "seconds");
  });
});

describe("useRoomCatchup: syncToRoomTimeIfNeeded", () => {
  it("is a no-op without an anchor", () => {
    const h = setup({ time: 50 });
    h.result.current.syncToRoomTimeIfNeeded();
    expect(h.player.seekTo).not.toHaveBeenCalled();
    expect(telemetry.recordDrift).not.toHaveBeenCalled();
  });

  it("is a no-op when the anchor is for a different URL", () => {
    const h = setup({ anchor: pausedAt(100, { url: URL_B }), time: 50 });
    h.result.current.syncToRoomTimeIfNeeded();
    expect(h.player.seekTo).not.toHaveBeenCalled();
    expect(telemetry.recordDrift).not.toHaveBeenCalled();
  });

  it("does not override a manual seek made less than 5 s ago", () => {
    const h = setup({ anchor: pausedAt(100), time: 50 });
    h.lastManualSeekRef.current = Date.now() - 4999;
    h.result.current.syncToRoomTimeIfNeeded();
    expect(h.player.seekTo).not.toHaveBeenCalled();

    h.lastManualSeekRef.current = Date.now() - 5000;
    h.result.current.syncToRoomTimeIfNeeded();
    expect(h.player.seekTo).toHaveBeenCalledWith(100, "seconds");
  });

  it("does not seek when drift is within 3 s, but still records drift", () => {
    const h = setup({ anchor: pausedAt(103), time: 100 });
    h.result.current.syncToRoomTimeIfNeeded();
    expect(telemetry.recordDrift).toHaveBeenCalledWith(3);
    expect(h.player.seekTo).not.toHaveBeenCalled();
    expect(telemetry.record).not.toHaveBeenCalled();
  });

  it("seeks when drift exceeds 3 s, suppressing the seek broadcast for 2.5 s", () => {
    const h = setup({ anchor: pausedAt(104), time: 100 });
    h.result.current.syncToRoomTimeIfNeeded();

    expect(telemetry.recordDrift).toHaveBeenCalledWith(4);
    expect(telemetry.record).toHaveBeenCalledWith("hardSeeks");
    expect(h.suppressNextSeekBroadcast).toHaveBeenCalledWith(2500);
    expect(h.player.seekTo).toHaveBeenCalledTimes(1);
    expect(h.player.seekTo).toHaveBeenCalledWith(104, "seconds");
    // The normal path does not use the internal player API.
    expect(h.internal.seekTo).not.toHaveBeenCalled();
    expect(h.handleSeekTo).not.toHaveBeenCalled();
  });

  it("also seeks backwards when the player is ahead of the room", () => {
    const h = setup({ anchor: pausedAt(20), time: 60 });
    h.result.current.syncToRoomTimeIfNeeded();
    expect(h.player.seekTo).toHaveBeenCalledWith(20, "seconds");
  });

  it("raises applyingRemoteSyncRef during the seek and releases it after 350 ms", () => {
    const h = setup({ anchor: pausedAt(104), time: 100 });
    let flagAtSeek: boolean | null = null;
    h.player.seekTo.mockImplementation(() => {
      flagAtSeek = h.applyingRemoteSyncRef.current;
    });
    h.result.current.syncToRoomTimeIfNeeded();
    expect(flagAtSeek).toBe(true);
    vi.advanceTimersByTime(349);
    expect(h.applyingRemoteSyncRef.current).toBe(true);
    vi.advanceTimersByTime(1);
    expect(h.applyingRemoteSyncRef.current).toBe(false);
  });

  it("extrapolates a playing anchor by elapsed time and playback rate", () => {
    const h = setup({
      anchor: anchor({
        anchorTime: 100,
        anchorAt: Date.now() - 10_000,
        playbackRate: 1.5,
      }),
      time: 50,
    });
    h.result.current.syncToRoomTimeIfNeeded();
    expect(h.player.seekTo).toHaveBeenCalledWith(115, "seconds");
  });

  it("does not extrapolate a paused anchor", () => {
    const h = setup({
      anchor: pausedAt(100, { anchorAt: Date.now() - 10_000 }),
      time: 50,
    });
    h.result.current.syncToRoomTimeIfNeeded();
    expect(h.player.seekTo).toHaveBeenCalledWith(100, "seconds");
  });

  it("treats playbackRate 0 as 1", () => {
    const h = setup({
      anchor: anchor({
        anchorTime: 100,
        anchorAt: Date.now() - 10_000,
        playbackRate: 0,
      }),
      time: 50,
    });
    h.result.current.syncToRoomTimeIfNeeded();
    expect(h.player.seekTo).toHaveBeenCalledWith(110, "seconds");
  });

  it("clamps an anchor timestamp in the future to zero elapsed time", () => {
    const h = setup({
      anchor: anchor({ anchorTime: 100, anchorAt: Date.now() + 5000 }),
      time: 50,
    });
    h.result.current.syncToRoomTimeIfNeeded();
    expect(h.player.seekTo).toHaveBeenCalledWith(100, "seconds");
  });

  it("clamps the target to the known duration", () => {
    const h = setup({
      anchor: anchor({ anchorTime: 100, anchorAt: Date.now() - 60_000 }),
      time: 50,
      props: { duration: 120 },
    });
    h.result.current.syncToRoomTimeIfNeeded();
    expect(h.player.seekTo).toHaveBeenCalledWith(120, "seconds");
  });

  it("treats duration 0 as unknown (no clamp)", () => {
    const h = setup({
      anchor: anchor({ anchorTime: 100, anchorAt: Date.now() - 60_000 }),
      time: 50,
      props: { duration: 0 },
    });
    h.result.current.syncToRoomTimeIfNeeded();
    expect(h.player.seekTo).toHaveBeenCalledWith(160, "seconds");
  });

  it("clamps a negative target to 0", () => {
    const h = setup({ anchor: pausedAt(-10), time: 50 });
    h.result.current.syncToRoomTimeIfNeeded();
    expect(h.player.seekTo).toHaveBeenCalledWith(0, "seconds");
  });

  it("throttles automatic seeks to one per 900 ms", () => {
    const h = setup({ anchor: pausedAt(100), time: 50 });
    h.result.current.syncToRoomTimeIfNeeded();
    expect(h.player.seekTo).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(899);
    h.result.current.syncToRoomTimeIfNeeded();
    expect(h.player.seekTo).toHaveBeenCalledTimes(1);
    // Throttled calls return before measuring drift.
    expect(telemetry.recordDrift).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    h.result.current.syncToRoomTimeIfNeeded();
    expect(h.player.seekTo).toHaveBeenCalledTimes(2);
  });

  it("does not arm the throttle when it decides not to seek", () => {
    const h = setup({ anchor: pausedAt(101), time: 100 });
    h.result.current.syncToRoomTimeIfNeeded();
    h.roomPlaybackAnchorRef.current = pausedAt(110);
    h.result.current.syncToRoomTimeIfNeeded();
    expect(h.player.seekTo).toHaveBeenCalledWith(110, "seconds");
  });

  it("skips a moderate (<5 s) correction when the anchor is under 1 s old", () => {
    const h = setup({
      anchor: pausedAt(104, { anchorAt: Date.now() - 999 }),
      time: 100,
    });
    h.result.current.syncToRoomTimeIfNeeded();
    expect(h.player.seekTo).not.toHaveBeenCalled();
    expect(telemetry.recordDrift).toHaveBeenCalledWith(4);
  });

  it("still corrects a large (>=5 s) drift against a fresh anchor", () => {
    const h = setup({
      anchor: pausedAt(105, { anchorAt: Date.now() - 500 }),
      time: 100,
    });
    h.result.current.syncToRoomTimeIfNeeded();
    expect(h.player.seekTo).toHaveBeenCalledWith(105, "seconds");
  });

  it("corrects a moderate drift once the anchor is 1 s old", () => {
    const h = setup({
      anchor: pausedAt(104, { anchorAt: Date.now() - 1000 }),
      time: 100,
    });
    h.result.current.syncToRoomTimeIfNeeded();
    expect(h.player.seekTo).toHaveBeenCalledWith(104, "seconds");
  });

  describe("user pause intent", () => {
    it("defers while the user paused recently and retries once the window ends", () => {
      const h = setup({ anchor: pausedAt(100), time: 50 });
      h.lastUserPauseAtRef.current = Date.now() - 2000;

      h.result.current.syncToRoomTimeIfNeeded();
      expect(h.player.seekTo).not.toHaveBeenCalled();
      expect(telemetry.recordDrift).not.toHaveBeenCalled();

      // remaining = 12000 - 2000 = 10000, +50 ms margin.
      vi.advanceTimersByTime(USER_PAUSE_INTENT_WINDOW_MS - 2000 + 49);
      expect(h.player.seekTo).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(h.player.seekTo).toHaveBeenCalledWith(100, "seconds");
    });

    it("arms only one deferred retry across repeated calls", () => {
      const h = setup({ anchor: pausedAt(100), time: 50 });
      h.lastUserPauseAtRef.current = Date.now();

      h.result.current.syncToRoomTimeIfNeeded();
      vi.advanceTimersByTime(3000);
      h.result.current.syncToRoomTimeIfNeeded();
      h.result.current.syncToRoomTimeIfNeeded();

      vi.advanceTimersByTime(USER_PAUSE_INTENT_WINDOW_MS);
      expect(telemetry.recordDrift).toHaveBeenCalledTimes(1);
      expect(h.player.seekTo).toHaveBeenCalledTimes(1);
    });

    it("the deferred retry is cleared on unmount", () => {
      const h = setup({ anchor: pausedAt(100), time: 50 });
      h.lastUserPauseAtRef.current = Date.now();
      h.result.current.syncToRoomTimeIfNeeded();
      h.unmount();
      vi.advanceTimersByTime(USER_PAUSE_INTENT_WINDOW_MS + 100);
      expect(h.player.seekTo).not.toHaveBeenCalled();
    });
  });

  describe("late joiner (player near 0, room far ahead)", () => {
    it("starts a pending catch-up with an immediate forced seek", () => {
      const h = setup({ anchor: pausedAt(100), time: 0 });
      h.result.current.syncToRoomTimeIfNeeded();

      expect(telemetry.record).toHaveBeenCalledWith("hardSeeks");
      expect(h.suppressNextSeekBroadcast).toHaveBeenCalledWith(3000);
      expect(h.player.seekTo).toHaveBeenCalledWith(100, "seconds");
      // Also drives the internal (YouTube IFrame) API directly.
      expect(h.internal.seekTo).toHaveBeenCalledWith(100, true);
      // Never forces play during catch-up.
      expect(h.internal.playVideo).not.toHaveBeenCalled();
      expect(h.player.playVideo).not.toHaveBeenCalled();
    });

    it("bypasses the fresh-anchor skip", () => {
      const h = setup({
        anchor: pausedAt(6, { anchorAt: Date.now() - 100 }),
        time: 2,
      });
      h.result.current.syncToRoomTimeIfNeeded();
      expect(h.player.seekTo).toHaveBeenCalledWith(6, "seconds");
    });

    it("bypasses the 3 s drift threshold only when the target is past 5 s", () => {
      // current 2.9 (<3), target 5 (not >5): drift 2.1 -> normal path, no seek.
      const a = setup({ anchor: pausedAt(5), time: 2.9 });
      a.result.current.syncToRoomTimeIfNeeded();
      expect(a.player.seekTo).not.toHaveBeenCalled();
      expect(telemetry.record).not.toHaveBeenCalled();

      // current 2.5, target 5.1: drift 2.6 is under the normal 3 s threshold,
      // but the late-joiner rule still issues a catch-up seek.
      const b = setup({ anchor: pausedAt(5.1), time: 2.5 });
      b.result.current.syncToRoomTimeIfNeeded();
      expect(b.player.seekTo).toHaveBeenCalledWith(5.1, "seconds");
    });

    it("does not count a hardSeek when the catch-up is already within 2.5 s and never seeks", () => {
      const h = setup({ anchor: pausedAt(5.1), time: 2.9 });
      h.result.current.syncToRoomTimeIfNeeded();
      expect(telemetry.record).not.toHaveBeenCalledWith("hardSeeks");
      expect(h.player.seekTo).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1000);
      expect(h.player.seekTo).not.toHaveBeenCalled();
    });

    it("treats a player that is not mounted yet as sitting at 0", () => {
      const h = setup({
        anchor: pausedAt(100),
        playerCurrent: null,
      });
      h.result.current.syncToRoomTimeIfNeeded();
      expect(telemetry.recordDrift).toHaveBeenCalledWith(100);
      expect(telemetry.record).toHaveBeenCalledWith("hardSeeks");

      // The player appears; the retry loop picks it up.
      const { player } = makePlayer(0);
      h.playerRef.current = player;
      vi.advanceTimersByTime(350);
      expect(player.seekTo).toHaveBeenCalledWith(100, "seconds");
    });

    it("arms the 900 ms throttle", () => {
      const h = setup({ anchor: pausedAt(100), time: 0 });
      h.result.current.syncToRoomTimeIfNeeded();
      h.state.time = 100;
      h.result.current.syncToRoomTimeIfNeeded();
      expect(telemetry.recordDrift).toHaveBeenCalledTimes(1);
    });
  });
});

describe("useRoomCatchup: tryApplyPendingRoomCatchup retry loop", () => {
  it("is a no-op without a pending catch-up", () => {
    const h = setup({ anchor: pausedAt(100), time: 0 });
    h.result.current.tryApplyPendingRoomCatchup();
    expect(h.player.seekTo).not.toHaveBeenCalled();
  });

  it("retries every 350 ms until the player lands within 2.5 s", () => {
    const h = setup({ anchor: pausedAt(100), time: 0 });
    h.result.current.syncToRoomTimeIfNeeded();
    expect(h.player.seekTo).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(350);
    expect(h.player.seekTo).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(350);
    expect(h.player.seekTo).toHaveBeenCalledTimes(3);

    h.state.time = 97.5; // drift exactly 2.5 -> accepted
    vi.advanceTimersByTime(350);
    expect(h.player.seekTo).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(5000);
    expect(h.player.seekTo).toHaveBeenCalledTimes(3);
    expect(telemetry.record).not.toHaveBeenCalledWith("catchupExhausted");
  });

  it("holds applyingRemoteSyncRef raised across consecutive retries", () => {
    const h = setup({ anchor: pausedAt(100), time: 0 });
    const flags: boolean[] = [];
    h.player.seekTo.mockImplementation(() => {
      flags.push(h.applyingRemoteSyncRef.current);
    });
    h.result.current.syncToRoomTimeIfNeeded();
    vi.advanceTimersByTime(350);
    vi.advanceTimersByTime(350);
    expect(flags).toEqual([true, true, true]);

    h.state.time = 100;
    vi.advanceTimersByTime(350); // lands, no new seek
    vi.advanceTimersByTime(350);
    expect(h.applyingRemoteSyncRef.current).toBe(false);
  });

  it("gives up after 30 attempts and records catchupExhausted once", () => {
    const h = setup({ anchor: pausedAt(100), time: 0 });
    h.result.current.syncToRoomTimeIfNeeded();

    // Attempt 1 is immediate; attempts 2..30 follow at 350 ms spacing,
    // i.e. the attempt cap (~10.2 s) hits before the 12 s window.
    vi.advanceTimersByTime(350 * 29);
    expect(h.player.seekTo).toHaveBeenCalledTimes(30);
    expect(telemetry.record).not.toHaveBeenCalledWith("catchupExhausted");

    vi.advanceTimersByTime(350);
    expect(h.player.seekTo).toHaveBeenCalledTimes(30);
    expect(telemetry.record).toHaveBeenCalledWith("catchupExhausted");

    vi.advanceTimersByTime(20_000);
    expect(h.player.seekTo).toHaveBeenCalledTimes(30);
    expect(
      telemetry.record.mock.calls.filter((c) => c[0] === "catchupExhausted"),
    ).toHaveLength(1);
  });

  it("drops silently (no exhausted count) when the room switches video", () => {
    const h = setup({ anchor: pausedAt(100), time: 0 });
    h.result.current.syncToRoomTimeIfNeeded();
    h.roomPlaybackAnchorRef.current = pausedAt(100, { url: URL_B });

    vi.advanceTimersByTime(350);
    expect(h.player.seekTo).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(h.player.seekTo).toHaveBeenCalledTimes(1);
    expect(telemetry.record).not.toHaveBeenCalledWith("catchupExhausted");
  });

  it("drops when the anchor is cleared", () => {
    const h = setup({ anchor: pausedAt(100), time: 0 });
    h.result.current.syncToRoomTimeIfNeeded();
    h.roomPlaybackAnchorRef.current = null;
    vi.advanceTimersByTime(5000);
    expect(h.player.seekTo).toHaveBeenCalledTimes(1);
  });

  it("keeps seeking the original target even if the anchor moves on the same URL", () => {
    const h = setup({ anchor: pausedAt(100), time: 0 });
    h.result.current.syncToRoomTimeIfNeeded();
    h.roomPlaybackAnchorRef.current = pausedAt(200);
    vi.advanceTimersByTime(350);
    expect(h.player.seekTo).toHaveBeenLastCalledWith(100, "seconds");
  });

  it("survives a player whose internal API throws", () => {
    const h = setup({ anchor: pausedAt(100), time: 0 });
    h.internal.seekTo.mockImplementation(() => {
      throw new Error("not ready");
    });
    expect(() => h.result.current.syncToRoomTimeIfNeeded()).not.toThrow();
    vi.advanceTimersByTime(350);
    expect(h.player.seekTo).toHaveBeenCalledTimes(2);
  });

  it("pauses retries while the user paused recently and drops the expired catch-up without counting it as exhausted", () => {
    // USER_PAUSE_INTENT_WINDOW_MS (12 s) equals the catch-up retry window, so
    // a pause during catch-up always outlives it. Respecting the pause is not
    // a failure, so it must not inflate "catchupExhausted".
    const h = setup({ anchor: pausedAt(100), time: 0 });
    h.result.current.syncToRoomTimeIfNeeded();
    expect(h.player.seekTo).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    h.lastUserPauseAtRef.current = Date.now();
    vi.advanceTimersByTime(250); // retry at 350 ms sees the pause
    expect(h.player.seekTo).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(USER_PAUSE_INTENT_WINDOW_MS);
    expect(h.player.seekTo).toHaveBeenCalledTimes(1);
    expect(telemetry.record).not.toHaveBeenCalledWith("catchupExhausted");
  });

  it("cancelPendingRoomCatchup stops retries and the pause-resume timer", () => {
    const h = setup({ anchor: pausedAt(100), time: 0 });
    h.result.current.syncToRoomTimeIfNeeded();
    h.result.current.cancelPendingRoomCatchup();
    vi.advanceTimersByTime(5000);
    expect(h.player.seekTo).toHaveBeenCalledTimes(1);

    // Pause-deferred path: cancel before the resume timer fires.
    const g = setup({ anchor: pausedAt(100), time: 0 });
    g.result.current.syncToRoomTimeIfNeeded();
    g.lastUserPauseAtRef.current = Date.now();
    vi.advanceTimersByTime(350);
    g.result.current.cancelPendingRoomCatchup();
    const clearSpy = vi.spyOn(window, "clearTimeout");
    g.result.current.cancelPendingRoomCatchup();
    // Second cancel has nothing left to clear.
    expect(clearSpy).not.toHaveBeenCalled();
    clearSpy.mockRestore();
    vi.advanceTimersByTime(USER_PAUSE_INTENT_WINDOW_MS + 100);
    expect(g.player.seekTo).toHaveBeenCalledTimes(1);
    expect(telemetry.record).not.toHaveBeenCalledWith("catchupExhausted");
  });

  // Regression: the unmount cleanup used to clear only the two pause-resume
  // timers, so a late-joiner catch-up kept seeking for up to 30 attempts
  // after the hook was gone.
  it("stops catch-up retries after unmount", () => {
    const h = setup({
      anchor: pausedAt(100),
      time: 0,
      props: { playerReady: true },
    });
    vi.advanceTimersByTime(50); // effect fires -> late-joiner catch-up
    expect(h.player.seekTo).toHaveBeenCalledTimes(1);

    h.unmount();
    vi.advanceTimersByTime(350);
    expect(h.player.seekTo).toHaveBeenCalledTimes(1);
  });

  // Regression: the hook used to release the shared applyingRemoteSyncRef
  // guard 350 ms after its own seek without checking ownership, cutting short
  // a 400 ms hold taken by room-state application just after it.
  it("does not clear an applyingRemoteSyncRef guard raised by another owner", () => {
    const h = setup({ anchor: pausedAt(104), time: 100 });
    h.result.current.syncToRoomTimeIfNeeded(); // catch-up seek at t=0

    vi.advanceTimersByTime(300);
    // Remote state applied at t=300; its owner holds the guard until t=700.
    holdRemoteSyncGuard(h.applyingRemoteSyncRef, 400);

    vi.advanceTimersByTime(50); // t=350: catch-up's release timer fires
    expect(h.applyingRemoteSyncRef.current).toBe(true);
    vi.advanceTimersByTime(350); // t=700
    expect(h.applyingRemoteSyncRef.current).toBe(false);
  });
});

describe("useRoomCatchup: handleUserSeek", () => {
  it("stamps the manual seek, cancels catch-up and force-seeks", () => {
    const h = setup({ anchor: pausedAt(100), time: 0 });
    h.result.current.syncToRoomTimeIfNeeded();
    expect(h.player.seekTo).toHaveBeenCalledTimes(1);

    h.result.current.handleUserSeek(42);
    expect(h.lastManualSeekRef.current).toBe(Date.now());
    expect(h.handleSeekTo).toHaveBeenCalledWith(42, { force: true });

    vi.advanceTimersByTime(5000);
    expect(h.player.seekTo).toHaveBeenCalledTimes(1);
  });

  it("blocks automatic sync for 5 s afterwards", () => {
    const h = setup({ anchor: pausedAt(100), time: 50 });
    h.result.current.handleUserSeek(50);
    vi.advanceTimersByTime(4999);
    h.result.current.syncToRoomTimeIfNeeded();
    expect(h.player.seekTo).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    h.result.current.syncToRoomTimeIfNeeded();
    expect(h.player.seekTo).toHaveBeenCalledWith(100, "seconds");
  });
});

describe("useRoomCatchup: handlePlayWithRoomCatchup", () => {
  it("clears user pause intent so the catch-up runs immediately", () => {
    const h = setup({ anchor: anchor({ anchorTime: 100 }), time: 50 });
    h.lastUserPauseAtRef.current = Date.now();
    h.result.current.handlePlayWithRoomCatchup();
    expect(h.lastUserPauseAtRef.current).toBe(0);
    expect(h.player.seekTo).toHaveBeenCalled();
  });

  it("syncs before calling handlePlay", () => {
    const h = setup({ anchor: pausedAt(100), time: 50 });
    const order: string[] = [];
    h.player.seekTo.mockImplementation(() => order.push("seek"));
    h.handlePlay.mockImplementation(() => order.push("play"));
    h.result.current.handlePlayWithRoomCatchup();
    expect(order).toEqual(["seek", "play"]);
  });

  it("broadcasts play (no suppression) when the room is paused on the same URL", () => {
    const h = setup({ anchor: pausedAt(10), time: 10 });
    h.result.current.handlePlayWithRoomCatchup();
    expect(h.suppressNextPlayBroadcast).not.toHaveBeenCalled();
    expect(h.handlePlay).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["no anchor yet", null],
    ["the room is already playing", anchor({ anchorTime: 0 })],
    ["the anchor is for another URL", pausedAt(10, { url: URL_B })],
  ])("treats play as local-only when %s", (_label, a) => {
    const h = setup({ anchor: a, time: 10 });
    h.result.current.handlePlayWithRoomCatchup();
    expect(h.suppressNextPlayBroadcast).toHaveBeenCalledWith(2500);
    expect(h.handlePlay).toHaveBeenCalledTimes(1);
  });

  it("starts playback within the gesture via the internal playVideo", () => {
    const h = setup({ anchor: pausedAt(10), time: 10 });
    h.result.current.handlePlayWithRoomCatchup();
    expect(h.internal.playVideo).toHaveBeenCalledTimes(1);
    expect(h.player.playVideo).not.toHaveBeenCalled();
  });

  it("falls back to playFromRef when there is no internal playVideo", () => {
    const h = setup({
      anchor: pausedAt(10),
      time: 10,
      withInternalPlayVideo: false,
    });
    h.result.current.handlePlayWithRoomCatchup();
    // playFromRef uses the ref handle's own playVideo.
    expect(h.player.playVideo).toHaveBeenCalledTimes(1);
  });

  it("falls back to an HTMLMediaElement's play()", () => {
    const video = document.createElement("video");
    const play = vi.spyOn(video, "play").mockResolvedValue(undefined);
    const h = setup({ anchor: pausedAt(0), playerCurrent: video });
    h.result.current.handlePlayWithRoomCatchup();
    expect(play).toHaveBeenCalledTimes(1);
    expect(h.handlePlay).toHaveBeenCalledTimes(1);
  });

  it("does not throw when no player is mounted", () => {
    const h = setup({ anchor: null, playerCurrent: null });
    expect(() => h.result.current.handlePlayWithRoomCatchup()).not.toThrow();
    expect(h.handlePlay).toHaveBeenCalledTimes(1);
  });
});
