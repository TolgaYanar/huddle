import { useCallback } from "react";

import { getCurrentTimeFromRef, pauseFromRef } from "../../../lib/player";

import type { PlaybackHandlersArgs } from "./types";

/**
 * Handle explicit user-initiated pause (e.g., clicking pause button).
 * Unlike the regular handlePause, this:
 * 1. Always broadcasts to room (bypasses applyingRemoteSyncRef check)
 * 2. Sets lastUserPauseAtRef to prevent room catchup from overriding
 * 3. Immediately sends the pause sync event (no debounce)
 */
export function useHandleUserPause(args: PlaybackHandlersArgs) {
  const { state, url, sendSyncEvent, addLogEntry } = args;

  const {
    playerRef,
    latestVideoStateRef,
    lastUserPauseAtRef,
    setVideoState,
    cancelPendingPause,
  } = state;

  return useCallback(() => {
    const now = Date.now();
    const currentTime = getCurrentTimeFromRef(playerRef);

    // Record that user explicitly paused - this prevents room catchup from overriding
    lastUserPauseAtRef.current = now;

    // Cancel any pending pause from the debounce mechanism
    cancelPendingPause();

    // Update local state immediately
    setVideoState("Paused");
    latestVideoStateRef.current = "Paused";

    // Actually pause the player
    void pauseFromRef(playerRef);

    // Always broadcast to room - this is an explicit user action
    sendSyncEvent("pause", currentTime, url);
    addLogEntry?.({ msg: `paused the video`, type: "pause", user: "You" });
  }, [
    addLogEntry,
    cancelPendingPause,
    lastUserPauseAtRef,
    latestVideoStateRef,
    playerRef,
    sendSyncEvent,
    setVideoState,
    url,
  ]);
}
