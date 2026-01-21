import { useCallback } from "react";

import { getCurrentTimeFromRef } from "../../lib/player";
import type { AddLogEntry, SendSyncEvent } from "./types";
import type { VideoPlayerState } from "./state";

export function useVolumeHandlers({
  state,
  sendSyncEvent,
  addLogEntry,
  audioSyncEnabled,
}: {
  state: VideoPlayerState;
  sendSyncEvent: SendSyncEvent;
  addLogEntry?: AddLogEntry;
  audioSyncEnabled: boolean;
}) {
  const {
    url,
    setVolume,
    setMuted,
    setLocalVolumeOverride,
    setLocalMutedOverride,
    setPlaybackRate,
    playerRef,
    latestRoomVolumeRef,
    latestRoomMutedRef,
    latestEffectiveMutedRef,
    lastAppliedYoutubeVolumeRef,
    pendingVolumeEmitRef,
    lastVolumeEmitAtRef,
    volumeEmitTimeoutRef,
    lastReadYoutubeRateRef,
  } = state;

  const handleVolumeFromController = useCallback(
    (nextVolume: number, nextMuted: boolean) => {
      const clamped = Math.max(0, Math.min(1, nextVolume));
      const roomVol = latestRoomVolumeRef.current;
      const roomMuted = latestRoomMutedRef.current;

      if (Math.abs(clamped - roomVol) < 0.01) {
        setLocalVolumeOverride(null);
      } else {
        setLocalVolumeOverride(clamped);
      }

      if (Boolean(nextMuted) === roomMuted) {
        setLocalMutedOverride(null);
      } else {
        setLocalMutedOverride(Boolean(nextMuted));
      }

      lastAppliedYoutubeVolumeRef.current = {
        vol: clamped,
        muted: Boolean(nextMuted),
      };
    },
    [
      latestRoomVolumeRef,
      latestRoomMutedRef,
      setLocalVolumeOverride,
      setLocalMutedOverride,
      lastAppliedYoutubeVolumeRef,
    ],
  );

  const handleVolumeChange = useCallback(
    (newVolume: number, forcedMuted?: boolean) => {
      const clamped = Math.max(0, Math.min(1, newVolume));
      const nextMuted =
        typeof forcedMuted === "boolean" ? forcedMuted : clamped <= 0;

      setVolume(clamped);
      setMuted(nextMuted);

      lastAppliedYoutubeVolumeRef.current = { vol: clamped, muted: nextMuted };

      pendingVolumeEmitRef.current = { volume: clamped, muted: nextMuted };

      const flush = () => {
        const pending = pendingVolumeEmitRef.current;
        if (!pending) return;
        pendingVolumeEmitRef.current = null;
        lastVolumeEmitAtRef.current = Date.now();
        const t = getCurrentTimeFromRef(playerRef);
        sendSyncEvent("set_volume", t, url, {
          volume: pending.volume,
          isMuted: pending.muted,
        });
      };

      const now = Date.now();
      const minIntervalMs = 120;
      const sinceLast = now - lastVolumeEmitAtRef.current;

      if (sinceLast >= minIntervalMs) {
        if (volumeEmitTimeoutRef.current) {
          window.clearTimeout(volumeEmitTimeoutRef.current);
          volumeEmitTimeoutRef.current = null;
        }
        flush();
        return;
      }

      if (volumeEmitTimeoutRef.current) return;
      volumeEmitTimeoutRef.current = window.setTimeout(
        () => {
          volumeEmitTimeoutRef.current = null;
          flush();
        },
        Math.max(0, minIntervalMs - sinceLast),
      );
    },
    [
      url,
      playerRef,
      sendSyncEvent,
      setVolume,
      setMuted,
      lastAppliedYoutubeVolumeRef,
      pendingVolumeEmitRef,
      lastVolumeEmitAtRef,
      volumeEmitTimeoutRef,
    ],
  );

  const handlePlaybackRateFromController = useCallback(
    (nextRate: number) => {
      const clamped = Math.max(0.25, Math.min(2, nextRate));

      setPlaybackRate(clamped);

      lastReadYoutubeRateRef.current = clamped;

      const t = getCurrentTimeFromRef(playerRef);
      sendSyncEvent("set_speed", t, url, { playbackSpeed: clamped });
    },
    [playerRef, sendSyncEvent, setPlaybackRate, url, lastReadYoutubeRateRef],
  );

  const handlePlaybackRateChange = useCallback(
    (rate: number) => {
      setPlaybackRate(rate);
      const t = getCurrentTimeFromRef(playerRef);
      sendSyncEvent("set_speed", t, url, { playbackSpeed: rate });
      addLogEntry?.({
        msg: `changed playback speed to ${rate}x`,
        type: "seek",
        user: "You",
      });
    },
    [addLogEntry, playerRef, sendSyncEvent, setPlaybackRate, url],
  );

  const handleLocalVolumeChange = useCallback(
    (newVolume: number) => {
      const clamped = Math.max(0, Math.min(1, newVolume));
      const roomVol = latestRoomVolumeRef.current;

      if (Math.abs(clamped - roomVol) < 0.01) {
        setLocalVolumeOverride(null);
      } else {
        setLocalVolumeOverride(clamped);
      }

      if (clamped <= 0) {
        setLocalMutedOverride(true);
      } else {
        setLocalMutedOverride(false);
      }
    },
    [latestRoomVolumeRef, setLocalVolumeOverride, setLocalMutedOverride],
  );

  const toggleLocalMute = useCallback(() => {
    const roomMuted = latestRoomMutedRef.current;
    const nextMuted = !latestEffectiveMutedRef.current;

    if (nextMuted === roomMuted) {
      setLocalMutedOverride(null);
    } else {
      setLocalMutedOverride(nextMuted);
    }
  }, [latestRoomMutedRef, latestEffectiveMutedRef, setLocalMutedOverride]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      const t = getCurrentTimeFromRef(playerRef);
      sendSyncEvent("set_mute", t, url, { isMuted: next });
      return next;
    });
  }, [playerRef, sendSyncEvent, setMuted, url]);

  return {
    handleVolumeChange,
    handleLocalVolumeChange,
    handleVolumeFromController,
    toggleMute,
    toggleLocalMute,
    handlePlaybackRateChange,
    handlePlaybackRateFromController,
    audioSyncEnabled,
  };
}
