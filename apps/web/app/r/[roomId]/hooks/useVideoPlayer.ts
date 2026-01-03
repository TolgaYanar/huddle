import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SyncAction } from "shared-logic";
import { formatTime } from "../lib/activity";
import {
  getCurrentTimeFromRef,
  getDurationFromRef,
  seekToFromRef,
} from "../lib/player";
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
  audioSyncEnabled: boolean;
  applyingRemoteSyncRef: React.MutableRefObject<boolean>;
  sendSyncEvent: (
    action: SyncAction,
    timestamp: number,
    videoUrl?: string,
    extra?: {
      volume?: number;
      isMuted?: boolean;
      playbackSpeed?: number;
      audioSyncEnabled?: boolean;
    }
  ) => void;
  addLogEntry?: (entry: Omit<LogEntry, "time">) => void;
}

export function useVideoPlayer({
  isClient,
  roomId,
  audioSyncEnabled,
  applyingRemoteSyncRef,
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
  const [localVolumeOverride, setLocalVolumeOverride] = useState<number | null>(
    null
  );
  const [localMutedOverride, setLocalMutedOverride] = useState<boolean | null>(
    null
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
    // Track what we're about to apply to YouTube to detect echoes
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

  // When audio sync is enabled for the room, we must "follow room" so that
  // built-in player controls and our custom UI reflect the same audio state.
  useEffect(() => {
    if (!audioSyncEnabled) return;
    setLocalVolumeOverride(null);
    setLocalMutedOverride(null);
  }, [audioSyncEnabled]);

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

  // Built-in player controls should be local-only (unique per user).
  // Treat built-in volume/mute as a local override that does not sync.
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

      // Immediately mark this as applied to prevent echo detection
      lastAppliedYoutubeVolumeRef.current = {
        vol: clamped,
        muted: Boolean(nextMuted),
      };
    },
    []
  );

  // Built-in player controls should sync to the room.
  // YouTube/direct file speed changes are clamped and synced to all users.
  const handlePlaybackRateFromController = useCallback(
    (nextRate: number) => {
      const clamped = Math.max(0.25, Math.min(2, nextRate));

      // Update room state immediately so this user sees the change
      setPlaybackRate(clamped);

      // Track what we just set to prevent echo detection
      lastReadYoutubeRateRef.current = clamped;

      // Also sync to all users
      const t = getCurrentTimeFromRef(playerRef);
      sendSyncEvent("set_speed", t, url, { playbackSpeed: clamped });
    },
    [sendSyncEvent, url]
  );

  // Room-synced volume/mute (used by our custom controller).
  // We also route YouTube's built-in slider changes through this when audio sync is enabled.
  const handleVolumeChange = useCallback(
    (newVolume: number, forcedMuted?: boolean) => {
      const clamped = Math.max(0, Math.min(1, newVolume));
      const nextMuted =
        typeof forcedMuted === "boolean" ? forcedMuted : clamped <= 0;

      setVolume(clamped);
      setMuted(nextMuted);

      // Mark as applied to prevent echo detection
      lastAppliedYoutubeVolumeRef.current = { vol: clamped, muted: nextMuted };

      // Rate-limit network sync to avoid spamming while dragging.
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
        Math.max(0, minIntervalMs - sinceLast)
      );
    },
    [sendSyncEvent, url]
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
    [addLogEntry, sendSyncEvent, url]
  );

  // Note: ReactPlayer handles volume/playbackRate via props internally.
  // Manual sync to internal player is not needed and causes conflicts with built-in controls.

  // Keep currentTime/duration updated for players that don't reliably surface
  // progress/duration callbacks (e.g. react-player v3 HtmlPlayer forwards props
  // directly to <video>/<audio>, which causes React warnings for custom handlers).
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

        // If we can read duration, the player is effectively ready.
        setPlayerReady(true);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isClient, url]);

  // YouTube iframe controls can change volume/mute without going through our UI.
  // Poll the internal YT player and route those changes through the same handlers
  // our custom controller uses.
  useEffect(() => {
    if (!isClient) return;

    const isYouTube = /youtube\.com|youtu\.be|youtube-nocookie\.com/i.test(url);
    if (!isYouTube) return;

    let cancelled = false;
    let loggedPlayerStructure = false;
    const id = window.setInterval(() => {
      if (cancelled) return;

      const current = playerRef.current as {
        getInternalPlayer?: () => unknown;
        volume?: number;
        muted?: boolean;
        playbackRate?: number;
      } | null;

      // Try to get internal player first, fallback to direct properties
      let internal = current?.getInternalPlayer?.() as
        | {
            getVolume?: () => unknown;
            isMuted?: () => unknown;
            getPlaybackRate?: () => unknown;
          }
        | null
        | undefined;

      // If getInternalPlayer doesn't work, try direct properties (youtube-video custom element)
      if (!internal && current && ("volume" in current || "muted" in current)) {
        internal = {
          getVolume: () => (current.volume ?? 0) * 100,
          isMuted: () => current.muted ?? false,
          getPlaybackRate: () => current.playbackRate ?? 1,
        };
      }

      if (!internal) {
        return;
      }

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

      // Never re-broadcast while we're applying remote state.
      if (applyingRemoteSyncRef.current) return;

      const now = Date.now();
      if (now - lastYoutubeVolumeSyncAtRef.current < 50) return;

      const roomVol = latestRoomVolumeRef.current;
      const roomMuted = latestRoomMutedRef.current;
      const effectiveVol = latestEffectiveVolumeRef.current;
      const effectiveMuted = latestEffectiveMutedRef.current;

      // Volume/mute
      if (nextVol !== null || nextMuted !== null) {
        const appliedVol =
          nextVol ?? (audioSyncEnabled ? roomVol : effectiveVol);
        const appliedMuted =
          nextMuted ?? (audioSyncEnabled ? roomMuted : effectiveMuted);

        // Check if THIS VALUE changed from last time we read it from YouTube
        const lastRead = lastReadYoutubeVolumeRef.current;
        const valueChanged =
          !lastRead ||
          Math.abs(appliedVol - lastRead.vol) >= 0.02 ||
          appliedMuted !== lastRead.muted;

        // Update what we last read
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
              // Same handler our custom volume control uses (room-synced).
              handleVolumeChange(
                Math.max(0, Math.min(1, appliedVol)),
                Boolean(appliedMuted)
              );
            } else {
              // Local-only mode: treat as a local override.
              handleVolumeFromController(
                Math.max(0, Math.min(1, appliedVol)),
                Boolean(appliedMuted)
              );
            }
          }
        }
      }

      // Playback rate (YouTube UI doesn't always trigger ReactPlayer callbacks)
      // Built-in controls should be local-only, similar to volume
      if (nextRate !== null) {
        const lastRead = lastReadYoutubeRateRef.current;
        // Only trigger if rate changed from last poll (not if it matches current state)
        const rateChanged =
          lastRead === null || Math.abs(nextRate - lastRead) >= 0.05;

        if (rateChanged) {
          // Update what we last read from YouTube
          lastReadYoutubeRateRef.current = nextRate;

          const currentRate = latestPlaybackRateRef.current;
          const changed = Math.abs(nextRate - currentRate) >= 0.05;

          if (changed) {
            if (now - lastYoutubeRateSyncAtRef.current >= 200) {
              lastYoutubeRateSyncAtRef.current = now;
              // Treat YouTube built-in rate changes as local (not synced to room)
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
    handleVolumeChange,
    handleVolumeFromController,
    handlePlaybackRateChange,
    handlePlaybackRateFromController,
  ]);

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
      lastLocalSeekRef.current = { time: newTime, at: Date.now() };
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
      lastLocalSeekRef.current = { time: newTime, at: Date.now() };
      addLogEntry?.({
        msg: `seeked to ${formatTime(newTime)}`,
        type: "seek",
        user: "You",
      });
    },
    [url, duration, sendSyncEvent, addLogEntry]
  );

  // Used when the user seeks via the built-in player controls.
  // The player already performed the seek, so we only update state + broadcast.
  const handleSeekFromController = useCallback(
    (time: number) => {
      const newTime = Math.max(0, Math.min(time, duration || Infinity));

      const last = lastLocalSeekRef.current;
      if (
        last &&
        Date.now() - last.at < 800 &&
        Math.abs(last.time - newTime) < 0.5
      ) {
        // Likely a follow-up callback from a programmatic seek we already broadcast.
        return;
      }

      setCurrentTime(newTime);
      sendSyncEvent("seek", newTime, url);
      lastLocalSeekRef.current = { time: newTime, at: Date.now() };
      addLogEntry?.({
        msg: `seeked to ${formatTime(newTime)}`,
        type: "seek",
        user: "You",
      });
    },
    [url, duration, sendSyncEvent, addLogEntry]
  );

  // Local-only volume/mute for the custom controller (does not sync to room).
  const handleLocalVolumeChange = useCallback((newVolume: number) => {
    const clamped = Math.max(0, Math.min(1, newVolume));
    const roomVol = latestRoomVolumeRef.current;

    if (Math.abs(clamped - roomVol) < 0.01) {
      setLocalVolumeOverride(null);
    } else {
      setLocalVolumeOverride(clamped);
    }

    // If the user moves the volume slider, treat that as an intent to unmute.
    // (This is key when the room is muted and the user wants local audio.)
    if (clamped <= 0) {
      setLocalMutedOverride(true);
    } else {
      setLocalMutedOverride(false);
    }
  }, []);

  const toggleLocalMute = useCallback(() => {
    const roomMuted = latestRoomMutedRef.current;
    const nextMuted = !latestEffectiveMutedRef.current;

    if (nextMuted === roomMuted) {
      setLocalMutedOverride(null);
    } else {
      setLocalMutedOverride(nextMuted);
    }
  }, []);

  const handleProgress = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handleDuration = useCallback((dur: number) => {
    setDuration(dur);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      const t = getCurrentTimeFromRef(playerRef);
      sendSyncEvent("set_mute", t, url, { isMuted: next });
      return next;
    });
  }, [sendSyncEvent, url]);

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
    effectiveMuted,
    effectiveVolume,
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
    handleSeekFromController,
    handleVolumeChange,
    handleLocalVolumeChange,
    handleVolumeFromController,
    handlePlaybackRateChange,
    handlePlaybackRateFromController,
    handleProgress,
    handleDuration,
    toggleMute,
    toggleLocalMute,
    handleUrlChange,
    loadVideoUrl,
    handlePlayerError,
    closePreviewModal,
  };
}
