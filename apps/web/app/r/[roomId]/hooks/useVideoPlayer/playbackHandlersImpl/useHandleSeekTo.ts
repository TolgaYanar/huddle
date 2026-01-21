import { useCallback } from "react";

import { formatTime } from "../../../lib/activity";
import {
  getHtmlMediaElementFromRef,
  playFromRef,
  seekToFromRef,
} from "../../../lib/player";

import type { PlaybackHandlersArgs, SeekToOpts } from "./types";

export function useHandleSeekTo(args: PlaybackHandlersArgs) {
  const {
    state,
    url,
    duration,
    sendSyncEvent,
    addLogEntry,
    hasInitialSyncRef,
    applyingRemoteSyncRef,
    lastManualSeekRef,
  } = args;

  const {
    playerRef,
    latestVideoStateRef,
    suppressSeekBroadcastUntilRef,
    suppressPauseBroadcastUntilRef,
    lastLocalSeekRef,
    setVideoState,
    setCurrentTime,
    cancelPendingPause,
  } = state;

  return useCallback(
    (time: number, opts?: SeekToOpts) => {
      const force = opts?.force === true;
      if (hasInitialSyncRef && !hasInitialSyncRef.current) {
        console.log(`[SEEK-TO] Blocked: initial sync not complete`);
        const newTime = Math.max(0, Math.min(time, duration || Infinity));
        seekToFromRef(playerRef, newTime);
        setCurrentTime(newTime);
        if (lastManualSeekRef) {
          lastManualSeekRef.current = Date.now();
        }
        return;
      }

      if (!force && Date.now() < suppressSeekBroadcastUntilRef.current) {
        const newTime = Math.max(0, Math.min(time, duration || Infinity));
        seekToFromRef(playerRef, newTime);
        setCurrentTime(newTime);
        return;
      }

      if (!force && applyingRemoteSyncRef.current) {
        console.log(`[SEEK-TO] Blocked: applying remote sync`);
        return;
      }

      const newTime = Math.max(0, Math.min(time, duration || Infinity));
      console.log(
        `[SEEK-TO] Seeking to ${newTime.toFixed(2)}s and broadcasting`,
      );
      seekToFromRef(playerRef, newTime);
      setCurrentTime(newTime);

      cancelPendingPause();

      if (force) {
        suppressPauseBroadcastUntilRef.current = Math.max(
          suppressPauseBroadcastUntilRef.current,
          Date.now() + 800,
        );
      }

      const wasPlaying = latestVideoStateRef.current === "Playing";
      const shouldUnpause = force && !wasPlaying;
      if (shouldUnpause) {
        setVideoState("Playing");
        latestVideoStateRef.current = "Playing";
        sendSyncEvent("play", newTime, url);

        if (getHtmlMediaElementFromRef(playerRef)) {
          void playFromRef(playerRef);
        }
      }

      sendSyncEvent("seek", newTime, url);

      lastLocalSeekRef.current = { time: newTime, at: Date.now() };
      if (lastManualSeekRef) {
        lastManualSeekRef.current = Date.now();
      }
      addLogEntry?.({
        msg: `seeked to ${formatTime(newTime)}`,
        type: "seek",
        user: "You",
      });
    },
    [
      addLogEntry,
      applyingRemoteSyncRef,
      cancelPendingPause,
      duration,
      hasInitialSyncRef,
      lastLocalSeekRef,
      lastManualSeekRef,
      latestVideoStateRef,
      playerRef,
      sendSyncEvent,
      setCurrentTime,
      setVideoState,
      suppressPauseBroadcastUntilRef,
      suppressSeekBroadcastUntilRef,
      url,
    ],
  );
}
