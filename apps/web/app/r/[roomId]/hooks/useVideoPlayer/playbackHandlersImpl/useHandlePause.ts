import { useCallback } from "react";

import { getCurrentTimeFromRef } from "../../../lib/player";

import type { PlaybackHandlersArgs } from "./types";

export function useHandlePause(args: PlaybackHandlersArgs) {
  const {
    state,
    url,
    sendSyncEvent,
    addLogEntry,
    hasInitialSyncRef,
    applyingRemoteSyncRef,
  } = args;

  const {
    playerRef,
    latestVideoStateRef,
    suppressPauseBroadcastUntilRef,
    pendingPauseTimeoutRef,
    pendingPauseRef,
    lastUserPauseAtRef,
    setVideoState,
    cancelPendingPause,
  } = state;

  return useCallback(() => {
    const hasUserActivation =
      typeof navigator !== "undefined" &&
      (navigator as { userActivation?: { isActive?: boolean } }).userActivation
        ?.isActive === true;

    // Always reflect the pause locally (even if we suppress broadcasting).
    setVideoState("Paused");
    latestVideoStateRef.current = "Paused";

    // If this is a real user gesture pause (native player controls, keyboard, etc),
    // broadcast immediately.
    if (hasUserActivation) {
      lastUserPauseAtRef.current = Date.now();
      const currentTime = getCurrentTimeFromRef(playerRef);
      cancelPendingPause();
      sendSyncEvent("pause", currentTime, url);
      addLogEntry?.({ msg: `paused the video`, type: "pause", user: "You" });
      return;
    }

    if (Date.now() < suppressPauseBroadcastUntilRef.current) {
      console.log(`[PAUSE] Suppressed: recent user seek`);
      // Still treat as local pause; just don't broadcast.
      cancelPendingPause();
      return;
    }

    if (hasInitialSyncRef && !hasInitialSyncRef.current) {
      cancelPendingPause();
      return;
    }

    if (applyingRemoteSyncRef.current) {
      cancelPendingPause();
      return;
    }

    const currentTime = getCurrentTimeFromRef(playerRef);
    cancelPendingPause();
    pendingPauseRef.current = { time: currentTime, url };
    pendingPauseTimeoutRef.current = window.setTimeout(() => {
      pendingPauseTimeoutRef.current = null;
      const pending = pendingPauseRef.current;
      pendingPauseRef.current = null;
      if (!pending) return;
      sendSyncEvent("pause", pending.time, pending.url);
      addLogEntry?.({ msg: `paused the video`, type: "pause", user: "You" });
    }, 300);
  }, [
    addLogEntry,
    applyingRemoteSyncRef,
    cancelPendingPause,
    hasInitialSyncRef,
    latestVideoStateRef,
    lastUserPauseAtRef,
    pendingPauseRef,
    pendingPauseTimeoutRef,
    playerRef,
    sendSyncEvent,
    setVideoState,
    suppressPauseBroadcastUntilRef,
    url,
  ]);
}
