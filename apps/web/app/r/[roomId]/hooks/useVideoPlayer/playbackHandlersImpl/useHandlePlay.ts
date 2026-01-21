import { useCallback } from "react";

import { getCurrentTimeFromRef } from "../../../lib/player";

import type { PlaybackHandlersArgs } from "./types";

export function useHandlePlay(args: PlaybackHandlersArgs) {
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
    suppressPlayBroadcastUntilRef,
    setVideoState,
    cancelPendingPause,
  } = state;

  return useCallback(() => {
    cancelPendingPause();

    if (Date.now() < suppressPlayBroadcastUntilRef.current) {
      setVideoState("Playing");
      latestVideoStateRef.current = "Playing";
      return;
    }

    if (hasInitialSyncRef && !hasInitialSyncRef.current) {
      setVideoState("Playing");
      latestVideoStateRef.current = "Playing";
      return;
    }

    if (applyingRemoteSyncRef.current) {
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
    applyingRemoteSyncRef,
    cancelPendingPause,
    hasInitialSyncRef,
    latestVideoStateRef,
    playerRef,
    sendSyncEvent,
    setVideoState,
    suppressPlayBroadcastUntilRef,
    url,
  ]);
}
