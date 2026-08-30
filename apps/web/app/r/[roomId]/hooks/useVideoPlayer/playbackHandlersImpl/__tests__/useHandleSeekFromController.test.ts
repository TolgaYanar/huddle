import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useHandleSeekFromController } from "../useHandleSeekFromController";

/**
 * Regression cover for the "seek war".
 *
 * The player callbacks decide "user vs. remote" from
 * navigator.userActivation.isActive, which is transient-active for ~5s after
 * ANY gesture anywhere on the page — typing one chat message was enough. They
 * then called this handler with `{ force: true }`, which used to bypass both
 * remote-sync guards. A seek we had just applied from remote state therefore
 * came back through onSeek and was re-broadcast to the room; every member who
 * had clicked anything recently echoed it.
 *
 * `force` must only bypass the small-delta heuristic, never the guards.
 */
function makeArgs(overrides: {
  applyingRemoteSync?: boolean;
  suppressUntil?: number;
  videoState?: string;
  currentTime?: number;
}) {
  const sendSyncEvent = vi.fn();
  const ref = <T>(current: T) => ({ current });

  const args = {
    state: {
      playerRef: ref<unknown>(null),
      latestVideoStateRef: ref(overrides.videoState ?? "Playing"),
      latestCurrentTimeRef: ref(overrides.currentTime ?? 0),
      suppressSeekBroadcastUntilRef: ref(overrides.suppressUntil ?? 0),
      suppressPauseBroadcastUntilRef: ref(0),
      lastLocalSeekRef: ref<{ time: number; at: number } | null>(null),
      lastControllerSeekEmitRef: ref<{ time: number; at: number } | null>(null),
      pendingControllerSeekRef: ref<number | null>(null),
      controllerSeekFlushTimeoutRef: ref<number | null>(null),
      setCurrentTime: vi.fn(),
      setVideoState: vi.fn(),
      cancelPendingPause: vi.fn(),
    },
    url: "https://example.test/v",
    duration: 3600,
    sendSyncEvent,
    addLogEntry: vi.fn(),
    hasInitialSyncRef: ref(true),
    applyingRemoteSyncRef: ref(overrides.applyingRemoteSync ?? false),
    lastManualSeekRef: ref(0),
    lastUserPauseAtRef: ref(0),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { args: args as any, sendSyncEvent };
}

describe("useHandleSeekFromController remote-sync guards", () => {
  it("does not broadcast while remote state is being applied, even with force", () => {
    const { args, sendSyncEvent } = makeArgs({ applyingRemoteSync: true });
    const { result } = renderHook(() => useHandleSeekFromController(args));

    result.current(120, { force: true });

    expect(sendSyncEvent).not.toHaveBeenCalled();
  });

  it("does not broadcast inside the seek-suppression window, even with force", () => {
    const { args, sendSyncEvent } = makeArgs({
      suppressUntil: Date.now() + 3000,
    });
    const { result } = renderHook(() => useHandleSeekFromController(args));

    result.current(120, { force: true });

    expect(sendSyncEvent).not.toHaveBeenCalled();
  });

  it("broadcasts a genuine user seek once no guard is armed", () => {
    const { args, sendSyncEvent } = makeArgs({ currentTime: 0 });
    const { result } = renderHook(() => useHandleSeekFromController(args));

    result.current(120, { force: true });

    expect(sendSyncEvent).toHaveBeenCalled();
    expect(sendSyncEvent.mock.calls.some((c) => c[0] === "seek")).toBe(true);
  });

  it("still lets force bypass the small-delta heuristic", () => {
    // A 2s nudge while playing is below the 6s threshold; without force it is
    // dropped, with force it must go out. This is the one job force keeps.
    const withForce = makeArgs({ currentTime: 100, videoState: "Playing" });
    const hookA = renderHook(() => useHandleSeekFromController(withForce.args));
    hookA.result.current(102, { force: true });
    expect(withForce.sendSyncEvent).toHaveBeenCalled();

    const noForce = makeArgs({ currentTime: 100, videoState: "Playing" });
    const hookB = renderHook(() => useHandleSeekFromController(noForce.args));
    hookB.result.current(102);
    expect(noForce.sendSyncEvent).not.toHaveBeenCalled();
  });
});
