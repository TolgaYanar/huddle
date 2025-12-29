import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SyncAction } from "shared-logic";
import { formatTime } from "../lib/activity";
import { getCurrentTimeFromRef, seekToFromRef } from "../lib/player";
import {
  getLoadTimeoutMs,
  getPrimeVideoMessage,
  getTimeoutErrorMessage,
  isPrimeVideoUrl,
  normalizeVideoUrl,
} from "../lib/video";
import { fetchVideoPreview, VideoPreview } from "../lib/video-preview";
import type { LogEntry } from "../types";

interface UseVideoPlayerProps {
  isClient: boolean;
  roomId: string;
  sendSyncEvent: (
    action: SyncAction,
    timestamp: number,
    videoUrl?: string
  ) => void;
  addLogEntry?: (entry: Omit<LogEntry, "time">) => void;
}

export function useVideoPlayer({
  isClient,
  roomId,
  sendSyncEvent,
  addLogEntry,
}: UseVideoPlayerProps) {
  const [url, setUrl] = useState(
    "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"
  );
  const [inputUrl, setInputUrl] = useState(url);
  const [videoState, setVideoState] = useState("Paused");
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(1);
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

  // Store roomId in localStorage
  useEffect(() => {
    try {
      window.localStorage.setItem("huddle:lastRoomId", roomId);
    } catch {
      // ignore
    }
  }, [roomId]);

  // Load timeout for player
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

  // Sync volume with the internal video element
  useEffect(() => {
    if (!playerRef.current) return;
    try {
      // ReactPlayer wraps the actual video element
      const rp = playerRef.current as unknown as {
        getInternalPlayer?: () => HTMLVideoElement;
      };
      const videoElement = rp?.getInternalPlayer?.();
      if (videoElement && typeof videoElement.volume !== "undefined") {
        videoElement.volume = volume;
      }
    } catch {
      // ignore
    }
  }, [volume]);

  // Sync playbackRate with the internal video element
  useEffect(() => {
    if (!playerRef.current) return;
    try {
      const rp = playerRef.current as unknown as {
        getInternalPlayer?: () => HTMLVideoElement;
      };
      const videoElement = rp?.getInternalPlayer?.();
      if (videoElement && typeof videoElement.playbackRate !== "undefined") {
        videoElement.playbackRate = playbackRate;
      }
    } catch {
      // ignore
    }
  }, [playbackRate]);

  const handlePlay = useCallback(() => {
    const currentTime = getCurrentTimeFromRef(playerRef);
    sendSyncEvent("play", currentTime, url);
    setVideoState("Playing");
    addLogEntry?.({ msg: `started playing`, type: "play", user: "You" });
  }, [url, sendSyncEvent, addLogEntry]);

  const handlePause = useCallback(() => {
    const currentTime = getCurrentTimeFromRef(playerRef);
    sendSyncEvent("pause", currentTime, url);
    setVideoState("Paused");
    addLogEntry?.({ msg: `paused the video`, type: "pause", user: "You" });
  }, [url, sendSyncEvent, addLogEntry]);

  const handleSeek = useCallback(
    (seconds: number) => {
      const time = getCurrentTimeFromRef(playerRef);
      const newTime = Math.max(0, time + seconds);
      seekToFromRef(playerRef, newTime);
      sendSyncEvent("seek", newTime, url);
      addLogEntry?.({
        msg: `jumped to ${formatTime(newTime)}`,
        type: "seek",
        user: "You",
      });
    },
    [url, sendSyncEvent, addLogEntry]
  );

  const handleSeekTo = useCallback(
    (time: number) => {
      const newTime = Math.max(0, Math.min(time, duration || Infinity));
      seekToFromRef(playerRef, newTime);
      setCurrentTime(newTime);
      sendSyncEvent("seek", newTime, url);
      addLogEntry?.({
        msg: `seeked to ${formatTime(newTime)}`,
        type: "seek",
        user: "You",
      });
    },
    [url, duration, sendSyncEvent, addLogEntry]
  );

  const handleVolumeChange = useCallback((newVolume: number) => {
    const clamped = Math.max(0, Math.min(1, newVolume));
    setVolume(clamped);
    if (clamped > 0) setMuted(false);
    else setMuted(true);
  }, []);

  const handlePlaybackRateChange = useCallback(
    (rate: number) => {
      setPlaybackRate(rate);
      addLogEntry?.({
        msg: `changed playback speed to ${rate}x`,
        type: "seek",
        user: "You",
      });
    },
    [addLogEntry]
  );

  const handleProgress = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handleDuration = useCallback((dur: number) => {
    setDuration(dur);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => !prev);
  }, []);

  const handleUrlChange = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (inputUrl === url) return;

      const normalized = normalizeVideoUrl(inputUrl);
      if (!normalized) return;

      const requestId = ++previewRequestIdRef.current;
      setIsPreviewLoading(true);
      setVideoPreview({
        url: normalized,
        title: "Loading preview…",
        thumbnail: null,
        duration: null,
        platform: "unknown",
      });
      setShowPreviewModal(true);

      const preview = await fetchVideoPreview(normalized).catch(() => null);
      if (previewRequestIdRef.current !== requestId) return;

      setIsPreviewLoading(false);
      setVideoPreview(
        preview ?? {
          url: normalized,
          title: "Video",
          thumbnail: null,
          duration: null,
          platform: "unknown",
        }
      );
    },
    [inputUrl, url]
  );

  const loadVideoUrl = useCallback(
    (nextUrl: string) => {
      setPlayerReady(false);
      setPlayerError(null);
      setUrl(nextUrl);
      setInputUrl(nextUrl);
      sendSyncEvent("change_url", 0, nextUrl);
      addLogEntry?.({
        msg: `changed video source`,
        type: "change_url",
        user: "You",
      });
      setIsPreviewLoading(false);
      setShowPreviewModal(false);
    },
    [sendSyncEvent, addLogEntry]
  );

  const handlePlayerError = useCallback(
    (e: unknown) => {
      const maybeErr = e as { name?: string; message?: string } | null;
      if (maybeErr?.name === "AbortError") return;
      if (maybeErr?.message?.includes("interrupted by a call to pause")) return;

      const currentTarget = (e as { currentTarget?: unknown } | null)
        ?.currentTarget;
      const target = (e as { target?: unknown } | null)?.target;
      const el =
        currentTarget instanceof HTMLMediaElement
          ? currentTarget
          : target instanceof HTMLMediaElement
            ? target
            : undefined;

      const mediaError = el?.error;
      const mediaErrorText = mediaError
        ? `MediaError code ${mediaError.code}${mediaError.message ? `: ${mediaError.message}` : ""}`
        : null;

      const message =
        typeof e === "string"
          ? e
          : maybeErr?.message
            ? String(maybeErr.message)
            : mediaErrorText
              ? mediaErrorText
              : "Video failed to load (often CORS/403/unsupported format).";

      console.warn("Player Error:", e);
      setPlayerError(message);
      addLogEntry?.({
        msg: `Player Error: ${message}`,
        type: "error",
        user: "System",
      });
    },
    [addLogEntry]
  );

  const closePreviewModal = useCallback(() => {
    previewRequestIdRef.current++;
    setIsPreviewLoading(false);
    setShowPreviewModal(false);
  }, []);

  const normalizedUrl = useMemo(() => normalizeVideoUrl(url), [url]);

  return {
    // State
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
    videoPreview,
    showPreviewModal,
    isPreviewLoading,

    // Refs
    playerRef,
    loadTimeoutRef,

    // Computed
    normalizedUrl,

    // Handlers
    handlePlay,
    handlePause,
    handleSeek,
    handleSeekTo,
    handleVolumeChange,
    handlePlaybackRateChange,
    handleProgress,
    handleDuration,
    toggleMute,
    handleUrlChange,
    loadVideoUrl,
    handlePlayerError,
    closePreviewModal,
  };
}
