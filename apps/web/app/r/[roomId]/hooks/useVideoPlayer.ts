import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SyncAction } from "shared-logic";
import { formatTime } from "../lib/activity";
import {
  getCurrentTimeFromRef,
  getDurationFromRef,
  getHtmlMediaElementFromRef,
  playFromRef,
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
  lastManualSeekRef?: React.MutableRefObject<number>;
  hasInitialSyncRef?: React.MutableRefObject<boolean>;
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
  lastManualSeekRef,
  hasInitialSyncRef,
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
  const latestCurrentTimeRef = useRef(currentTime);
  const latestVideoStateRef = useRef(videoState);
  // Suppress broadcasting "play" for a short window when playback is started
  // programmatically (e.g., YouTube recovery after the tab/window becomes visible).
  const suppressPlayBroadcastUntilRef = useRef(0);
  // Suppress broadcasting "seek" for a short window when we seek
  // programmatically (e.g., late-joiner catch-up to room anchor).
  const suppressSeekBroadcastUntilRef = useRef(0);
  // Some players emit a transient PAUSE event during user seeks/scrubs.
  // If we broadcast that pause, the whole room can get stuck paused.
  const suppressPauseBroadcastUntilRef = useRef(0);
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
    null
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

  useEffect(() => {
    latestCurrentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    latestVideoStateRef.current = videoState;
  }, [videoState]);

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
    cancelPendingPause();

    // If the player emitted "play" as a side effect of an internal recovery
    // (not a user action), keep local state in sync but do not broadcast.
    if (Date.now() < suppressPlayBroadcastUntilRef.current) {
      setVideoState("Playing");
      latestVideoStateRef.current = "Playing";
      return;
    }

    // Don't broadcast play events until user has received initial room state.
    // Otherwise new joiners can broadcast their cached/default position and
    // reset the room for everyone.
    if (hasInitialSyncRef && !hasInitialSyncRef.current) {
      setVideoState("Playing");
      latestVideoStateRef.current = "Playing";
      return;
    }

    // Don't re-broadcast when applying remote sync
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
    url,
    sendSyncEvent,
    addLogEntry,
    hasInitialSyncRef,
    applyingRemoteSyncRef,
  ]);

  const suppressNextPlayBroadcast = useCallback((ms: number = 1500) => {
    const until = Date.now() + Math.max(0, ms);
    suppressPlayBroadcastUntilRef.current = Math.max(
      suppressPlayBroadcastUntilRef.current,
      until
    );
  }, []);

  const handlePause = useCallback(() => {
    // Ignore transient pause events that happen during/just after a user seek.
    if (Date.now() < suppressPauseBroadcastUntilRef.current) {
      console.log(`[PAUSE] Suppressed: recent user seek`);
      return;
    }

    // Don't broadcast pause events until user has received initial room state.
    if (hasInitialSyncRef && !hasInitialSyncRef.current) {
      setVideoState("Paused");
      latestVideoStateRef.current = "Paused";
      return;
    }

    // Don't re-broadcast when applying remote sync
    if (applyingRemoteSyncRef.current) {
      setVideoState("Paused");
      latestVideoStateRef.current = "Paused";
      return;
    }

    // During scrubbing, many players emit a PAUSE event as an intermediate
    // state. If we broadcast that pause immediately, everyone else pauses.
    // Debounce pause and cancel it if a seek/play follows quickly.
    const currentTime = getCurrentTimeFromRef(playerRef);
    setVideoState("Paused");
    latestVideoStateRef.current = "Paused";

    cancelPendingPause();
    pendingPauseRef.current = { time: currentTime, url };
    pendingPauseTimeoutRef.current = window.setTimeout(() => {
      pendingPauseTimeoutRef.current = null;
      const pending = pendingPauseRef.current;
      pendingPauseRef.current = null;
      if (!pending) return;
      sendSyncEvent("pause", pending.time, pending.url);
      addLogEntry?.({ msg: `paused the video`, type: "pause", user: "You" });
    }, 300);
  }, [
    url,
    sendSyncEvent,
    addLogEntry,
    hasInitialSyncRef,
    applyingRemoteSyncRef,
    cancelPendingPause,
  ]);

  const handleSeek = useCallback(
    (seconds: number) => {
      // Don't broadcast seeks until initial sync complete
      if (hasInitialSyncRef && !hasInitialSyncRef.current) {
        return;
      }

      // Don't re-broadcast when applying remote sync
      if (applyingRemoteSyncRef.current) {
        return;
      }

      const time = getCurrentTimeFromRef(playerRef);
      const newTime = Math.max(0, time + seconds);
      seekToFromRef(playerRef, newTime);

      cancelPendingPause();

      if (lastManualSeekRef) {
        lastManualSeekRef.current = Date.now();
      }

      // Arm a short pause suppression window for this user navigation.
      suppressPauseBroadcastUntilRef.current = Math.max(
        suppressPauseBroadcastUntilRef.current,
        Date.now() + 800
      );

      const wasPlaying = latestVideoStateRef.current === "Playing";
      // User navigation should unpause.
      if (!wasPlaying) {
        setVideoState("Playing");
        // Update ref immediately to avoid duplicate play emits during scrubs.
        latestVideoStateRef.current = "Playing";
        // Emit play first so the server doesn't broadcast a paused room_state snapshot.
        sendSyncEvent("play", newTime, url);

        // For native <video>/<audio> playback, state alone won't start playback.
        if (getHtmlMediaElementFromRef(playerRef)) {
          void playFromRef(playerRef);
        }
      }

      // Preserve seek event for activity log + precise syncing.
      sendSyncEvent("seek", newTime, url);

      lastLocalSeekRef.current = { time: newTime, at: Date.now() };
      addLogEntry?.({
        msg: `jumped to ${formatTime(newTime)}`,
        type: "seek",
        user: "You",
      });
    },
    [url, sendSyncEvent, addLogEntry, hasInitialSyncRef, applyingRemoteSyncRef]
  );

  const handleSeekTo = useCallback(
    (time: number, opts?: { force?: boolean }) => {
      const force = opts?.force === true;
      // Don't broadcast seeks until initial sync complete
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

      // Suppress synthetic/programmatic seeks.
      if (!force && Date.now() < suppressSeekBroadcastUntilRef.current) {
        const newTime = Math.max(0, Math.min(time, duration || Infinity));
        seekToFromRef(playerRef, newTime);
        setCurrentTime(newTime);
        return;
      }

      // Don't re-broadcast when applying remote sync
      if (!force && applyingRemoteSyncRef.current) {
        console.log(`[SEEK-TO] Blocked: applying remote sync`);
        return;
      }

      const newTime = Math.max(0, Math.min(time, duration || Infinity));
      console.log(
        `[SEEK-TO] Seeking to ${newTime.toFixed(2)}s and broadcasting`
      );
      seekToFromRef(playerRef, newTime);
      setCurrentTime(newTime);

      cancelPendingPause();

      if (force) {
        // Arm a short pause suppression window for this user navigation.
        suppressPauseBroadcastUntilRef.current = Math.max(
          suppressPauseBroadcastUntilRef.current,
          Date.now() + 800
        );
      }

      const wasPlaying = latestVideoStateRef.current === "Playing";
      const shouldUnpause = force && !wasPlaying;
      // If this was a user-initiated seek while paused, unpause.
      if (shouldUnpause) {
        setVideoState("Playing");
        // Update ref immediately to avoid duplicate play emits during scrubs.
        latestVideoStateRef.current = "Playing";
        // Emit play first so the server doesn't broadcast a paused room_state snapshot.
        sendSyncEvent("play", newTime, url);

        // For native <video>/<audio> playback, state alone won't start playback.
        if (getHtmlMediaElementFromRef(playerRef)) {
          void playFromRef(playerRef);
        }
      }

      // Preserve seek event for activity log + precise syncing.
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
      url,
      duration,
      sendSyncEvent,
      addLogEntry,
      lastManualSeekRef,
      hasInitialSyncRef,
      applyingRemoteSyncRef,
    ]
  );

  // Used when the user seeks via the built-in player controls.
  // The player already performed the seek, so we only update state + broadcast.
  const handleSeekFromController = useCallback(
    (time: number, opts?: { force?: boolean }) => {
      const force = opts?.force === true;
      // Don't broadcast seeks until initial sync complete
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

      // Suppress synthetic/programmatic seeks.
      if (!force && Date.now() < suppressSeekBroadcastUntilRef.current) {
        const newTime = Math.max(0, Math.min(time, duration || Infinity));
        seekToFromRef(playerRef, newTime);
        setCurrentTime(newTime);
        return;
      }

      // Don't re-broadcast when applying remote sync
      if (!force && applyingRemoteSyncRef.current) {
        console.log(`[SEEK] Blocked: applying remote sync`);
        return;
      }

      const newTime = Math.max(0, Math.min(time, duration || Infinity));

      // Some embedded players (notably YouTube) can fire "seeked"-like events
      // during normal playback/buffering. If we're currently playing and the
      // delta is small, treat it as noise (not an intentional user seek).
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
        // Likely a follow-up callback from a programmatic seek we already broadcast.
        console.log(
          `[SEEK] Blocked: duplicate seek (within 800ms and <0.5s delta)`
        );
        return;
      }

      console.log(`[SEEK] Broadcasting seek to ${newTime.toFixed(2)}s`);

      const emitSeek = (t: number) => {
        cancelPendingPause();

        if (force) {
          // Arm a short pause suppression window for this user navigation.
          suppressPauseBroadcastUntilRef.current = Math.max(
            suppressPauseBroadcastUntilRef.current,
            Date.now() + 800
          );
        }

        lastControllerSeekEmitRef.current = { time: t, at: Date.now() };
        setCurrentTime(t);

        const wasPlaying = latestVideoStateRef.current === "Playing";
        const shouldUnpause = force && !wasPlaying;
        // User navigation should unpause.
        if (shouldUnpause) {
          setVideoState("Playing");
          // Update ref immediately to avoid duplicate play emits during scrubs.
          latestVideoStateRef.current = "Playing";
          // Emit play first so the server doesn't broadcast a paused room_state snapshot.
          sendSyncEvent("play", t, url);

          // For native <video>/<audio> playback, state alone won't start playback.
          if (getHtmlMediaElementFromRef(playerRef)) {
            void playFromRef(playerRef);
          }
        }

        // Preserve seek event for activity log + precise syncing.
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

      // Many embedded players (including YouTube) can fire multiple seek
      // callbacks while the user is scrubbing. Don't drop them; instead, emit
      // the final seek after a short quiet period.
      const lastController = lastControllerSeekEmitRef.current;
      const now = Date.now();
      const recent = lastController && now - lastController.at < 350;

      if (!recent) {
        // Fresh seek -> emit immediately.
        emitSeek(newTime);
        pendingControllerSeekRef.current = null;
        if (controllerSeekFlushTimeoutRef.current) {
          window.clearTimeout(controllerSeekFlushTimeoutRef.current);
          controllerSeekFlushTimeoutRef.current = null;
        }
        return;
      }

      // Rapid sequence -> schedule a trailing emit.
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
      url,
      duration,
      sendSyncEvent,
      addLogEntry,
      lastManualSeekRef,
      hasInitialSyncRef,
      applyingRemoteSyncRef,
      suppressSeekBroadcastUntilRef,
      cancelPendingPause,
    ]
  );

  const suppressNextSeekBroadcast = useCallback((ms: number = 2000) => {
    const until = Date.now() + Math.max(0, ms);
    suppressSeekBroadcastUntilRef.current = Math.max(
      suppressSeekBroadcastUntilRef.current,
      until
    );
  }, []);

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

  const handleProgress = useCallback(
    (time: number) => {
      const now = Date.now();

      // If the underlying player is clearly advancing time while our UI says
      // Paused (can happen during YouTube scrubs / transient pause events),
      // treat that as "actually playing" and resync.
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

        // For native <video>/<audio> playback, state alone won't start playback.
        if (getHtmlMediaElementFromRef(playerRef)) {
          void playFromRef(playerRef);
        }
      }

      setCurrentTime(time);
    },
    [
      url,
      sendSyncEvent,
      hasInitialSyncRef,
      applyingRemoteSyncRef,
      lastManualSeekRef,
      cancelPendingPause,
    ]
  );

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
    (
      nextUrl: string,
      options?: { forcePlay?: boolean; skipBroadcast?: boolean }
    ) => {
      const { forcePlay, skipBroadcast } = options ?? {};
      const wasPlaying = latestVideoStateRef.current === "Playing";
      setPlayerReady(false);
      setPlayerError(null);
      setUrl(nextUrl);
      setInputUrl(nextUrl);

      // Only broadcast sync events if not receiving from external source
      if (!skipBroadcast) {
        sendSyncEvent("change_url", 0, nextUrl);
      }

      // If the room was already playing, keep it playing after changing the URL.
      // This prevents late receivers from needing to press play (which would
      // otherwise broadcast a fresh play@0 and reset everyone).
      // Also auto-play if forcePlay is true (e.g., playlist item was triggered).
      if (wasPlaying || forcePlay) {
        setVideoState("Playing");
        if (!skipBroadcast) {
          sendSyncEvent("play", 0, nextUrl);
        }
      } else {
        setVideoState("Paused");
      }
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

    // Used by player components when they call play() programmatically.
    suppressNextPlayBroadcast,

    // Used by player components when they seek() programmatically.
    suppressNextSeekBroadcast,
  };
}
