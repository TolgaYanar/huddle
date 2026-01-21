import { useCallback } from "react";

import { formatTime } from "../../../lib/activity";
import {
  getCurrentTimeFromRef,
  getHtmlMediaElementFromRef,
  playFromRef,
  seekToFromRef,
} from "../../../lib/player";
import { USER_PAUSE_INTENT_WINDOW_MS } from "../constants";

import type { PlaybackHandlersArgs } from "./types";

export function useHandleSeek(args: PlaybackHandlersArgs) {
  const {
    state,
    url,
    sendSyncEvent,
    addLogEntry,
    hasInitialSyncRef,
    applyingRemoteSyncRef,
    lastManualSeekRef,
    lastUserPauseAtRef,
  } = args;

  const {
    playerRef,
    latestVideoStateRef,
    suppressPauseBroadcastUntilRef,
    lastLocalSeekRef,
    setVideoState,
    cancelPendingPause,
  } = state;

  return useCallback(
    (seconds: number) => {
      if (hasInitialSyncRef && !hasInitialSyncRef.current) return;
      if (applyingRemoteSyncRef.current) return;

      const time = getCurrentTimeFromRef(playerRef);
      const newTime = Math.max(0, time + seconds);
      seekToFromRef(playerRef, newTime);

      cancelPendingPause();

      if (lastManualSeekRef) {
        lastManualSeekRef.current = Date.now();
      }

      suppressPauseBroadcastUntilRef.current = Math.max(
        suppressPauseBroadcastUntilRef.current,
        Date.now() + 800,
      );

      // Check if user recently paused - don't auto-resume if so
      const userPausedRecently =
        lastUserPauseAtRef &&
        Date.now() - lastUserPauseAtRef.current < USER_PAUSE_INTENT_WINDOW_MS;

      const wasPlaying = latestVideoStateRef.current === "Playing";
      if (!wasPlaying && !userPausedRecently) {
        setVideoState("Playing");
        latestVideoStateRef.current = "Playing";
        sendSyncEvent("play", newTime, url);

        if (getHtmlMediaElementFromRef(playerRef)) {
          void playFromRef(playerRef);
        }
      }

      sendSyncEvent("seek", newTime, url);

      lastLocalSeekRef.current = { time: newTime, at: Date.now() };
      addLogEntry?.({
        msg: `jumped to ${formatTime(newTime)}`,
        type: "seek",
        user: "You",
      });
    },
    [
      addLogEntry,
      applyingRemoteSyncRef,
      cancelPendingPause,
      hasInitialSyncRef,
      lastLocalSeekRef,
      lastManualSeekRef,
      lastUserPauseAtRef,
      latestVideoStateRef,
      playerRef,
      sendSyncEvent,
      setVideoState,
      suppressPauseBroadcastUntilRef,
      url,
    ],
  );
}
