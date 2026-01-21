import { useCallback } from "react";

import { getCurrentTimeFromRef } from "../../../lib/player";

import type { PlaybackHandlersArgs } from "./types";

/**
 * Handle explicit user-initiated play (native controls/keyboard click).
 * This should override pause-intent and remote-sync echo windows, but still
 * respect suppression windows used to avoid duplicate broadcasts (e.g. room catchup).
 */
export function useHandleUserPlay(args: PlaybackHandlersArgs) {
  const { state, url, sendSyncEvent, addLogEntry, hasInitialSyncRef } = args;

  const {
    playerRef,
    latestVideoStateRef,
    suppressPlayBroadcastUntilRef,
    lastUserPauseAtRef,
    setVideoState,
    cancelPendingPause,
  } = state;

  return useCallback(() => {
    cancelPendingPause();

    // User explicitly wants to play now; clear pause intent.
    lastUserPauseAtRef.current = 0;

    // Respect suppression windows (used to avoid duplicate play broadcasts).
    if (Date.now() < suppressPlayBroadcastUntilRef.current) {
      setVideoState("Playing");
      latestVideoStateRef.current = "Playing";
      return;
    }

    // If we don't have room_state yet, avoid broadcasting a possibly stale play.
    if (hasInitialSyncRef && !hasInitialSyncRef.current) {
      setVideoState("Playing");
      latestVideoStateRef.current = "Playing";
      return;
    }

    const currentTime = getCurrentTimeFromRef(playerRef);
    sendSyncEvent("play", currentTime, url);
    setVideoState("Playing");
    latestVideoStateRef.current = "Playing";
    addLogEntry?.({ msg: `started playing`, type: "play", user: "You" });
  }, [
    addLogEntry,
    cancelPendingPause,
    hasInitialSyncRef,
    lastUserPauseAtRef,
    latestVideoStateRef,
    playerRef,
    sendSyncEvent,
    setVideoState,
    suppressPlayBroadcastUntilRef,
    url,
  ]);
}
