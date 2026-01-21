import { useCallback } from "react";

import { getHtmlMediaElementFromRef, playFromRef } from "../../../lib/player";

import type { PlaybackHandlersArgs } from "./types";

export function useHandleProgress(args: PlaybackHandlersArgs) {
  const {
    state,
    url,
    sendSyncEvent,
    hasInitialSyncRef,
    applyingRemoteSyncRef,
    lastManualSeekRef,
  } = args;

  const {
    playerRef,
    latestVideoStateRef,
    lastProgressTickRef,
    lastAutoResumeAtRef,
    setCurrentTime,
    setVideoState,
    cancelPendingPause,
  } = state;

  return useCallback(
    (time: number) => {
      const now = Date.now();

      const prev = lastProgressTickRef.current;
      lastProgressTickRef.current = { time, at: now };

      const isActuallyAdvancing =
        prev &&
        now - prev.at < 1500 &&
        time - prev.time > 0.25 &&
        Number.isFinite(time);

      const uiPaused = latestVideoStateRef.current !== "Playing";
      const recentUserSeek =
        !!lastManualSeekRef && now - lastManualSeekRef.current < 5000;
      const cooldownOk = now - lastAutoResumeAtRef.current > 1500;

      if (
        isActuallyAdvancing &&
        uiPaused &&
        recentUserSeek &&
        cooldownOk &&
        !applyingRemoteSyncRef.current &&
        (hasInitialSyncRef ? hasInitialSyncRef.current : true)
      ) {
        lastAutoResumeAtRef.current = now;
        cancelPendingPause();
        setVideoState("Playing");
        latestVideoStateRef.current = "Playing";
        sendSyncEvent("play", time, url);

        if (getHtmlMediaElementFromRef(playerRef)) {
          void playFromRef(playerRef);
        }
      }

      setCurrentTime(time);
    },
    [
      applyingRemoteSyncRef,
      cancelPendingPause,
      hasInitialSyncRef,
      lastAutoResumeAtRef,
      lastManualSeekRef,
      lastProgressTickRef,
      latestVideoStateRef,
      playerRef,
      sendSyncEvent,
      setCurrentTime,
      setVideoState,
      url,
    ],
  );
}
