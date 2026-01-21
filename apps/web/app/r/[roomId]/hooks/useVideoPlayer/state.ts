import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getDurationFromRef, getCurrentTimeFromRef } from "../../lib/player";
import {
  getLoadTimeoutMs,
  getPrimeVideoMessage,
  getTimeoutErrorMessage,
  isPrimeVideoUrl,
  normalizeVideoUrl,
} from "../../lib/video";
import type { VideoPreview } from "../../lib/video-preview";

export type VideoPlayerState = ReturnType<typeof useVideoPlayerState>;

export function useVideoPlayerState({
  isClient,
  roomId,
  audioSyncEnabled,
}: {
  isClient: boolean;
  roomId: string;
  audioSyncEnabled: boolean;
}) {
  const [url, setUrl] = useState(
    "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
  );
  const [inputUrl, setInputUrl] = useState(url);
  const [videoState, setVideoState] = useState("Paused");
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [localVolumeOverride, setLocalVolumeOverride] = useState<number | null>(
    null,
  );
  const [localMutedOverride, setLocalMutedOverride] = useState<boolean | null>(
    null,
  );
  const [playbackRate, setPlaybackRate] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [isBuffering, setIsBuffering] = useState(false);

  const [videoPreview, setVideoPreview] = useState<VideoPreview | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const previewRequestIdRef = useRef(0);

  const playerRef = useRef<unknown>(null);
  const loadTimeoutRef = useRef<number | null>(null);

  const latestUrlRef = useRef(url);
  const latestRoomVolumeRef = useRef(volume);
  const latestRoomMutedRef = useRef(muted);
  const lastRoomAVChangeAtRef = useRef(0);
  const latestEffectiveVolumeRef = useRef(1);
  const latestEffectiveMutedRef = useRef(true);
  const lastYoutubeVolumeSyncAtRef = useRef(0);
  const lastYoutubeRateSyncAtRef = useRef(0);
  const latestPlaybackRateRef = useRef(playbackRate);
  const latestCurrentTimeRef = useRef(currentTime);
  const latestVideoStateRef = useRef(videoState);

  const suppressPlayBroadcastUntilRef = useRef(0);
  const suppressSeekBroadcastUntilRef = useRef(0);
  const suppressPauseBroadcastUntilRef = useRef(0);

  // Track when user explicitly clicked pause - this takes priority over room sync
  const lastUserPauseAtRef = useRef(0);

  const lastVolumeEmitAtRef = useRef(0);
  const lastAppliedYoutubeVolumeRef = useRef<{
    vol: number;
    muted: boolean;
  } | null>(null);
  const lastReadYoutubeVolumeRef = useRef<{
    vol: number;
    muted: boolean;
  } | null>(null);
  const lastReadYoutubeRateRef = useRef<number | null>(null);
  const pendingVolumeEmitRef = useRef<{
    volume: number;
    muted: boolean;
  } | null>(null);
  const volumeEmitTimeoutRef = useRef<number | null>(null);

  const lastLocalSeekRef = useRef<{ time: number; at: number } | null>(null);
  const lastControllerSeekEmitRef = useRef<{ time: number; at: number } | null>(
    null,
  );
  const pendingControllerSeekRef = useRef<number | null>(null);
  const controllerSeekFlushTimeoutRef = useRef<number | null>(null);

  const lastProgressTickRef = useRef<{ time: number; at: number } | null>(null);
  const lastAutoResumeAtRef = useRef(0);

  const pendingPauseTimeoutRef = useRef<number | null>(null);
  const pendingPauseRef = useRef<{ time: number; url: string } | null>(null);

  const cancelPendingPause = useCallback(() => {
    if (pendingPauseTimeoutRef.current) {
      window.clearTimeout(pendingPauseTimeoutRef.current);
      pendingPauseTimeoutRef.current = null;
    }
    pendingPauseRef.current = null;
  }, []);

  const effectiveVolume = useMemo(() => {
    const v = localVolumeOverride ?? volume;
    return Math.max(0, Math.min(1, v));
  }, [volume, localVolumeOverride]);

  const effectiveMuted = useMemo(() => {
    return (localMutedOverride ?? muted) === true;
  }, [muted, localMutedOverride]);

  useEffect(() => {
    latestUrlRef.current = url;
  }, [url]);

  useEffect(() => {
    latestRoomVolumeRef.current = volume;
    lastRoomAVChangeAtRef.current = Date.now();
  }, [volume]);

  useEffect(() => {
    latestRoomMutedRef.current = muted;
    lastRoomAVChangeAtRef.current = Date.now();
  }, [muted]);

  useEffect(() => {
    latestEffectiveVolumeRef.current = effectiveVolume;
    lastAppliedYoutubeVolumeRef.current = {
      vol: effectiveVolume,
      muted: effectiveMuted,
    };
  }, [effectiveVolume, effectiveMuted]);

  useEffect(() => {
    latestEffectiveMutedRef.current = effectiveMuted;
  }, [effectiveMuted]);

  useEffect(() => {
    latestPlaybackRateRef.current = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    latestCurrentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    latestVideoStateRef.current = videoState;
  }, [videoState]);

  useEffect(() => {
    if (!audioSyncEnabled) return;
    setLocalVolumeOverride(null);
    setLocalMutedOverride(null);
  }, [audioSyncEnabled]);

  useEffect(() => {
    try {
      window.localStorage.setItem("huddle:lastRoomId", roomId);
    } catch {
      // ignore
    }
  }, [roomId]);

  useEffect(() => {
    if (!isClient) return;

    if (loadTimeoutRef.current) {
      window.clearTimeout(loadTimeoutRef.current);
    }

    setIsBuffering(false);
    setPlayerReady(false);
    setPlayerError(null);

    if (isPrimeVideoUrl(normalizeVideoUrl(url))) {
      setPlayerReady(true);
      setPlayerError(getPrimeVideoMessage());
      return;
    }

    const timeoutMs = getLoadTimeoutMs(url);
    loadTimeoutRef.current = window.setTimeout(() => {
      setPlayerError(getTimeoutErrorMessage(url));
    }, timeoutMs);

    return () => {
      if (loadTimeoutRef.current) {
        window.clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
    };
  }, [isClient, url]);

  useEffect(() => {
    if (!isClient) return;

    let cancelled = false;
    const id = window.setInterval(() => {
      if (cancelled) return;

      const t = getCurrentTimeFromRef(playerRef);
      setCurrentTime((prev) => (Math.abs(prev - t) > 0.25 ? t : prev));

      const d = getDurationFromRef(playerRef);
      if (d > 0) {
        setDuration((prev) => (Math.abs(prev - d) > 0.25 ? d : prev));
        setPlayerReady(true);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isClient, url]);

  return {
    // state
    url,
    setUrl,
    inputUrl,
    setInputUrl,
    videoState,
    setVideoState,
    muted,
    setMuted,
    volume,
    setVolume,
    localVolumeOverride,
    setLocalVolumeOverride,
    localMutedOverride,
    setLocalMutedOverride,
    playbackRate,
    setPlaybackRate,
    currentTime,
    setCurrentTime,
    duration,
    setDuration,
    playerReady,
    setPlayerReady,
    playerError,
    setPlayerError,
    isBuffering,
    setIsBuffering,

    // preview
    videoPreview,
    setVideoPreview,
    showPreviewModal,
    setShowPreviewModal,
    isPreviewLoading,
    setIsPreviewLoading,
    previewRequestIdRef,

    // refs
    playerRef,
    loadTimeoutRef,
    latestUrlRef,
    latestRoomVolumeRef,
    latestRoomMutedRef,
    lastRoomAVChangeAtRef,
    latestEffectiveVolumeRef,
    latestEffectiveMutedRef,
    lastYoutubeVolumeSyncAtRef,
    lastYoutubeRateSyncAtRef,
    latestPlaybackRateRef,
    latestCurrentTimeRef,
    latestVideoStateRef,
    suppressPlayBroadcastUntilRef,
    suppressSeekBroadcastUntilRef,
    suppressPauseBroadcastUntilRef,
    lastVolumeEmitAtRef,
    lastAppliedYoutubeVolumeRef,
    lastReadYoutubeVolumeRef,
    lastReadYoutubeRateRef,
    pendingVolumeEmitRef,
    volumeEmitTimeoutRef,
    lastLocalSeekRef,
    lastControllerSeekEmitRef,
    pendingControllerSeekRef,
    controllerSeekFlushTimeoutRef,
    lastProgressTickRef,
    lastAutoResumeAtRef,
    pendingPauseTimeoutRef,
    pendingPauseRef,
    lastUserPauseAtRef,

    // computed
    effectiveVolume,
    effectiveMuted,

    // helpers
    cancelPendingPause,
  };
}
