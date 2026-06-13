import { act, renderHook } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import { useVideoPlayerState } from "../state";
import { useHandlePause } from "../playbackHandlersImpl/useHandlePause";
import type { PlaybackHandlersArgs } from "../playbackHandlersImpl/types";

// Focused unit test for the Phase 3 end-of-video / playlist auto-advance fix.
//
// suppressPauseForPlaylistAdvance() (owned by useVideoPlayerState) must (a) drop
// any already-scheduled debounced ended-pause via cancelPendingPause() and (b)
// arm suppressPauseBroadcastUntilRef so that the non-user "ended" pause fired by
// the player in the next ~2.5s is swallowed by useHandlePause's existing guard
// rather than broadcasting pause(endTime) and racing the playlist's
// change_url/play for the next item.
//
// Rendering the entire useVideoPlayer tree is heavy (intervals, YouTube polling,
// volume handlers), so we compose only the two units that own the behavior:
// useVideoPlayerState (the refs + the new callback) and useHandlePause (the
// suppression guard). In jsdom navigator.userActivation is undefined, so
// handlePause() takes the non-gesture path — exactly the ended-pause case.

const URL = "https://example.com/video.mp4";

function setup() {
  const sendSyncEvent = vi.fn();

  const harness = renderHook(() => {
    const state = useVideoPlayerState({
      isClient: false,
      roomId: "test-room",
      audioSyncEnabled: true,
    });

    const applyingRemoteSyncRef = { current: false };
    const hasInitialSyncRef = { current: true };

    const args = {
      state,
      url: URL,
      duration: 100,
      sendSyncEvent,
      applyingRemoteSyncRef,
      hasInitialSyncRef,
    } as unknown as PlaybackHandlersArgs;

    const handlePause = useHandlePause(args);

    return { state, handlePause };
  });

  return { harness, sendSyncEvent };
}

describe("suppressPauseForPlaylistAdvance", () => {
  it("swallows a subsequent non-user pause so it is not broadcast", () => {
    const { harness, sendSyncEvent } = setup();

    act(() => {
      harness.result.current.state.suppressPauseForPlaylistAdvance();
    });

    // An end-of-video (non-user) pause fired immediately after the advance.
    act(() => {
      harness.result.current.handlePause();
    });

    expect(sendSyncEvent).not.toHaveBeenCalled();
  });

  it("cancels an already-scheduled debounced ended-pause", () => {
    vi.useFakeTimers();
    try {
      const { harness, sendSyncEvent } = setup();

      // First, a non-user pause schedules the 300ms debounce broadcast.
      act(() => {
        harness.result.current.handlePause();
      });

      // Playlist auto-advance suppresses + cancels the pending pause.
      act(() => {
        harness.result.current.state.suppressPauseForPlaylistAdvance();
      });

      // Flush past the original 300ms debounce window.
      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(sendSyncEvent).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not permanently disable pause broadcasting", () => {
    vi.useFakeTimers();
    try {
      const { harness, sendSyncEvent } = setup();

      act(() => {
        harness.result.current.state.suppressPauseForPlaylistAdvance();
      });

      // After the ~2.5s suppression window elapses, a fresh non-user pause
      // again schedules and broadcasts (debounced) normally.
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      act(() => {
        harness.result.current.handlePause();
      });
      act(() => {
        vi.advanceTimersByTime(400);
      });

      expect(sendSyncEvent).toHaveBeenCalledWith("pause", expect.any(Number), URL);
    } finally {
      vi.useRealTimers();
    }
  });
});
