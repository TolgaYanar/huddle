import { useEffect } from "react";

import type { VideoPlayerState } from "./state";

export function useYouTubeControlPolling({
  isClient,
  url,
  audioSyncEnabled,
  applyingRemoteSyncRef,
  state,
  handleVolumeChange,
  handleVolumeFromController,
  handlePlaybackRateFromController,
}: {
  isClient: boolean;
  url: string;
  audioSyncEnabled: boolean;
  applyingRemoteSyncRef: React.MutableRefObject<boolean>;
  state: VideoPlayerState;
  handleVolumeChange: (v: number, forcedMuted?: boolean) => void;
  handleVolumeFromController: (v: number, muted: boolean) => void;
  handlePlaybackRateFromController: (rate: number) => void;
}) {
  const {
    playerRef,
    lastYoutubeVolumeSyncAtRef,
    lastYoutubeRateSyncAtRef,
    latestRoomVolumeRef,
    latestRoomMutedRef,
    latestEffectiveVolumeRef,
    latestEffectiveMutedRef,
    lastReadYoutubeVolumeRef,
    lastReadYoutubeRateRef,
    latestPlaybackRateRef,
  } = state;

  useEffect(() => {
    if (!isClient) return;

    const isYouTube = /youtube\.com|youtu\.be|youtube-nocookie\.com/i.test(url);
    if (!isYouTube) return;

    let cancelled = false;
    const id = window.setInterval(() => {
      if (cancelled) return;

      const current = playerRef.current as {
        getInternalPlayer?: () => unknown;
        volume?: number;
        muted?: boolean;
        playbackRate?: number;
      } | null;

      let internal = current?.getInternalPlayer?.() as
        | {
            getVolume?: () => unknown;
            isMuted?: () => unknown;
            getPlaybackRate?: () => unknown;
          }
        | null
        | undefined;

      if (!internal && current && ("volume" in current || "muted" in current)) {
        internal = {
          getVolume: () => (current.volume ?? 0) * 100,
          isMuted: () => current.muted ?? false,
          getPlaybackRate: () => current.playbackRate ?? 1,
        };
      }

      if (!internal) return;

      const rawVol =
        typeof internal.getVolume === "function" ? internal.getVolume() : null;
      const rawMuted =
        typeof internal.isMuted === "function" ? internal.isMuted() : null;
      const rawRate =
        typeof internal.getPlaybackRate === "function"
          ? internal.getPlaybackRate()
          : null;

      const volNum =
        typeof rawVol === "number" && isFinite(rawVol) ? rawVol : null;
      const nextVol =
        volNum === null ? null : Math.max(0, Math.min(1, volNum / 100));
      const nextMuted = typeof rawMuted === "boolean" ? rawMuted : null;

      const nextRate =
        typeof rawRate === "number" && Number.isFinite(rawRate)
          ? rawRate
          : null;

      if (nextVol === null && nextMuted === null && nextRate === null) return;

      if (applyingRemoteSyncRef.current) return;

      const now = Date.now();
      if (now - lastYoutubeVolumeSyncAtRef.current < 50) return;

      const roomVol = latestRoomVolumeRef.current;
      const roomMuted = latestRoomMutedRef.current;
      const effectiveVol = latestEffectiveVolumeRef.current;
      const effectiveMuted = latestEffectiveMutedRef.current;

      if (nextVol !== null || nextMuted !== null) {
        const appliedVol =
          nextVol ?? (audioSyncEnabled ? roomVol : effectiveVol);
        const appliedMuted =
          nextMuted ?? (audioSyncEnabled ? roomMuted : effectiveMuted);

        const lastRead = lastReadYoutubeVolumeRef.current;
        const valueChanged =
          !lastRead ||
          Math.abs(appliedVol - lastRead.vol) >= 0.02 ||
          appliedMuted !== lastRead.muted;

        lastReadYoutubeVolumeRef.current = {
          vol: appliedVol,
          muted: appliedMuted,
        };

        if (valueChanged) {
          const changed = audioSyncEnabled
            ? Math.abs(appliedVol - roomVol) >= 0.02 ||
              appliedMuted !== roomMuted
            : Math.abs(appliedVol - effectiveVol) >= 0.02 ||
              appliedMuted !== effectiveMuted;

          if (changed) {
            lastYoutubeVolumeSyncAtRef.current = now;

            if (audioSyncEnabled) {
              handleVolumeChange(
                Math.max(0, Math.min(1, appliedVol)),
                Boolean(appliedMuted),
              );
            } else {
              handleVolumeFromController(
                Math.max(0, Math.min(1, appliedVol)),
                Boolean(appliedMuted),
              );
            }
          }
        }
      }

      if (nextRate !== null) {
        const lastRead = lastReadYoutubeRateRef.current;
        const rateChanged =
          lastRead === null || Math.abs(nextRate - lastRead) >= 0.05;

        if (rateChanged) {
          lastReadYoutubeRateRef.current = nextRate;

          const currentRate = latestPlaybackRateRef.current;
          const changed = Math.abs(nextRate - currentRate) >= 0.05;

          if (changed) {
            if (now - lastYoutubeRateSyncAtRef.current >= 200) {
              lastYoutubeRateSyncAtRef.current = now;
              handlePlaybackRateFromController(nextRate);
            }
          }
        }
      }
    }, 50);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [
    isClient,
    url,
    audioSyncEnabled,
    applyingRemoteSyncRef,
    playerRef,
    lastYoutubeVolumeSyncAtRef,
    lastYoutubeRateSyncAtRef,
    latestRoomVolumeRef,
    latestRoomMutedRef,
    latestEffectiveVolumeRef,
    latestEffectiveMutedRef,
    lastReadYoutubeVolumeRef,
    lastReadYoutubeRateRef,
    latestPlaybackRateRef,
    handleVolumeChange,
    handleVolumeFromController,
    handlePlaybackRateFromController,
  ]);
}
