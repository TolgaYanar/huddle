import { useCallback } from "react";

import { formatTime } from "../../../lib/activity";
import {
  getHtmlMediaElementFromRef,
  playFromRef,
  seekToFromRef,
} from "../../../lib/player";

import type { PlaybackHandlersArgs, SeekToOpts } from "./types";

export function useHandleSeekFromController(args: PlaybackHandlersArgs) {
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
    latestCurrentTimeRef,
    suppressSeekBroadcastUntilRef,
    suppressPauseBroadcastUntilRef,
    lastLocalSeekRef,
    lastControllerSeekEmitRef,
    pendingControllerSeekRef,
    controllerSeekFlushTimeoutRef,
    setCurrentTime,
    setVideoState,
    cancelPendingPause,
  } = state;

  return useCallback(
    (time: number, opts?: SeekToOpts) => {
      const force = opts?.force === true;
      if (hasInitialSyncRef && !hasInitialSyncRef.current) {
        console.log(`[SEEK] Blocked: initial sync not complete`);
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
        console.log(`[SEEK] Blocked: applying remote sync`);
        return;
      }

      const newTime = Math.max(0, Math.min(time, duration || Infinity));

      const isPlaying = latestVideoStateRef.current === "Playing";
      const approxNow = latestCurrentTimeRef.current;
      if (!force && isPlaying && Math.abs(approxNow - newTime) < 6) {
        console.log(`[SEEK] Blocked: small delta without force flag`);
        return;
      }

      const last = lastLocalSeekRef.current;
      if (
        last &&
        Date.now() - last.at < 800 &&
        Math.abs(last.time - newTime) < 0.5
      ) {
        console.log(
          `[SEEK] Blocked: duplicate seek (within 800ms and <0.5s delta)`,
        );
        return;
      }

      console.log(`[SEEK] Broadcasting seek to ${newTime.toFixed(2)}s`);

      const emitSeek = (t: number) => {
        cancelPendingPause();

        if (force) {
          suppressPauseBroadcastUntilRef.current = Math.max(
            suppressPauseBroadcastUntilRef.current,
            Date.now() + 800,
          );
        }

        lastControllerSeekEmitRef.current = { time: t, at: Date.now() };
        setCurrentTime(t);

        const wasPlaying = latestVideoStateRef.current === "Playing";
        const shouldUnpause = force && !wasPlaying;
        if (shouldUnpause) {
          setVideoState("Playing");
          latestVideoStateRef.current = "Playing";
          sendSyncEvent("play", t, url);

          if (getHtmlMediaElementFromRef(playerRef)) {
            void playFromRef(playerRef);
          }
        }

        sendSyncEvent("seek", t, url);

        lastLocalSeekRef.current = { time: t, at: Date.now() };
        if (lastManualSeekRef) {
          lastManualSeekRef.current = Date.now();
        }
        addLogEntry?.({
          msg: `seeked to ${formatTime(t)}`,
          type: "seek",
          user: "You",
        });
      };

      const lastController = lastControllerSeekEmitRef.current;
      const now = Date.now();
      const recent = lastController && now - lastController.at < 350;

      if (!recent) {
        emitSeek(newTime);
        pendingControllerSeekRef.current = null;
        if (controllerSeekFlushTimeoutRef.current) {
          window.clearTimeout(controllerSeekFlushTimeoutRef.current);
          controllerSeekFlushTimeoutRef.current = null;
        }
        return;
      }

      pendingControllerSeekRef.current = newTime;
      if (controllerSeekFlushTimeoutRef.current) {
        window.clearTimeout(controllerSeekFlushTimeoutRef.current);
      }
      controllerSeekFlushTimeoutRef.current = window.setTimeout(() => {
        controllerSeekFlushTimeoutRef.current = null;
        const pending = pendingControllerSeekRef.current;
        pendingControllerSeekRef.current = null;
        if (typeof pending === "number" && Number.isFinite(pending)) {
          const last = lastControllerSeekEmitRef.current;
          if (!last || Math.abs(last.time - pending) > 0.25) {
            emitSeek(pending);
          }
        }
      }, 250);
    },
    [
      addLogEntry,
      applyingRemoteSyncRef,
      cancelPendingPause,
      controllerSeekFlushTimeoutRef,
      duration,
      hasInitialSyncRef,
      lastControllerSeekEmitRef,
      lastLocalSeekRef,
      lastManualSeekRef,
      latestCurrentTimeRef,
      latestVideoStateRef,
      pendingControllerSeekRef,
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
