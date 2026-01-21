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
    setVideoState,
    cancelPendingPause,
  } = state;

  return useCallback(() => {
    if (Date.now() < suppressPauseBroadcastUntilRef.current) {
      console.log(`[PAUSE] Suppressed: recent user seek`);
      return;
    }

    if (hasInitialSyncRef && !hasInitialSyncRef.current) {
      setVideoState("Paused");
      latestVideoStateRef.current = "Paused";
      return;
    }

    if (applyingRemoteSyncRef.current) {
      setVideoState("Paused");
      latestVideoStateRef.current = "Paused";
      return;
    }

    const currentTime = getCurrentTimeFromRef(playerRef);
    setVideoState("Paused");
    latestVideoStateRef.current = "Paused";

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
    pendingPauseRef,
    pendingPauseTimeoutRef,
    playerRef,
    sendSyncEvent,
    setVideoState,
    suppressPauseBroadcastUntilRef,
    url,
  ]);
}
