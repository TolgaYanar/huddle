"use client";

import React from "react";
import ReactPlayerBase from "react-player";

// Cast ReactPlayer to any to work around broken TypeScript definitions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ReactPlayer = ReactPlayerBase as any;

import { PinnedStageOverlay } from "./PinnedStageOverlay";
import { WebcamOverlay } from "./WebcamOverlay";
import { VideoControls } from "./VideoControls";
import { NetflixSyncPlayer } from "./NetflixSyncPlayer";
import YouTubeIFramePlayer from "./YouTubeIFramePlayer";
import {
  parseDraggedTilePayload,
  TILE_DND_MIME,
  type DraggedTilePayload,
} from "../lib/dnd";
import {
  getHtmlMediaElementFromRef,
  getCurrentTimeFromRef,
  pauseFromRef,
  playFromRef,
  seekToFromRef,
} from "../lib/player";
import { getYouTubeVideoId, isYouTubeUrl } from "../lib/video";
import type { WebRTCMediaState } from "shared-logic";

type StageView = {
  id: string;
  isLocal: boolean;
  stream: MediaStream;
};

type RemoteStream = {
  id: string;
  stream: MediaStream;
  media?: WebRTCMediaState;
};

type YouTubeSearchItem = {
  videoId: string;
  title: string;
  channelTitle: string | null;
  thumbnail: string | null;
};

type YouTubeSearchResponse =
  | { ok: true; items: YouTubeSearchItem[] }
  | {
      ok: false;
      reason:
        | "missing_key"
        | "missing_query"
        | "quota"
        | "youtube_api_error"
        | "network";
    };

export function PlayerSection({
  inputUrl,
  setInputUrl,
  handleUrlChange,

  playerContainerRef,
  togglePlayerFullscreen,
  isPlayerFullscreen,

  isDraggingTile,
  setIsDraggingTile,
  isStageDragOver,
  setIsStageDragOver,
  setPinnedStage,

  stageView,
  screenStageContainerRef,
  toggleScreenFullscreen,
  isScreenFullscreen,
  onUnpinStage,

  localCamTrack,
  remotes,

  setCamEnabled,

  isClient,
  isKick,
  isTwitch,
  isPrime,
  isNetflix,
  isWebEmbed,
  isBadYoutubeUrl,
  normalizedUrl,
  kickEmbedSrc,
  twitchEmbedSrc,

  canPlay,
  playerReady,
  setPlayerReady,
  playerError,
  setPlayerError,
  isBuffering,
  setIsBuffering,

  loadTimeoutRef,
  playerRef,
  handlePlayerError,
  applyingRemoteSyncRef,
  roomPlaybackAnchorRef,
  lastManualSeekRef,

  muted,
  volume,
  effectiveMuted,
  effectiveVolume,
  audioSyncEnabled,
  onAudioSyncEnabledChange,
  playbackRate,
  currentTime,
  duration,
  canControlPlayback,
  isConnected,
  videoState,
  handlePlay,
  handlePause,
  handleSeekTo,
  handleSeekFromController,
  handleVolumeChange,
  handleLocalVolumeChange,
  handleVolumeFromController,
  handlePlaybackRateChange,
  handlePlaybackRateFromController,
  toggleMute,
  toggleLocalMute,
  handleProgress,
  handleDuration,

  fullscreenChatOpen,
  setFullscreenChatOpen,
  fullscreenChatMessages,
  chatText,
  setChatText,
  handleSendChat,
  onVideoEnded,
}: {
  inputUrl: string;
  setInputUrl: React.Dispatch<React.SetStateAction<string>>;
  handleUrlChange: (e: React.FormEvent) => void;

  playerContainerRef: React.RefObject<HTMLDivElement | null>;
  togglePlayerFullscreen: () => void;
  isPlayerFullscreen: boolean;

  isDraggingTile: boolean;
  setIsDraggingTile: React.Dispatch<React.SetStateAction<boolean>>;
  isStageDragOver: boolean;
  setIsStageDragOver: React.Dispatch<React.SetStateAction<boolean>>;
  setPinnedStage: React.Dispatch<
    React.SetStateAction<DraggedTilePayload | null>
  >;

  stageView: StageView | null;
  screenStageContainerRef: React.RefObject<HTMLDivElement | null>;
  toggleScreenFullscreen: () => void;
  isScreenFullscreen: boolean;
  onUnpinStage: () => void;

  localCamTrack: MediaStreamTrack | null;
  remotes: RemoteStream[];

  setCamEnabled: (enabled: boolean) => void;

  isClient: boolean;
  isKick: boolean;
  isTwitch: boolean;
  isPrime: boolean;
  isNetflix: boolean;
  isWebEmbed: boolean;
  isBadYoutubeUrl: boolean;
  normalizedUrl: string;
  kickEmbedSrc: string | null;
  twitchEmbedSrc: string | null;

  canPlay: boolean;
  playerReady: boolean;
  setPlayerReady: React.Dispatch<React.SetStateAction<boolean>>;
  playerError: string | null;
  setPlayerError: React.Dispatch<React.SetStateAction<string | null>>;
  isBuffering: boolean;
  setIsBuffering: React.Dispatch<React.SetStateAction<boolean>>;

  loadTimeoutRef: React.MutableRefObject<number | null>;
  playerRef: React.RefObject<unknown>;
  handlePlayerError: (e: unknown) => void;
  applyingRemoteSyncRef: React.MutableRefObject<boolean>;
  roomPlaybackAnchorRef: React.MutableRefObject<{
    url: string;
    isPlaying: boolean;
    anchorTime: number;
    anchorAt: number;
    playbackRate: number;
  } | null>;
  lastManualSeekRef: React.MutableRefObject<number>;

  muted: boolean;
  volume: number;
  effectiveMuted: boolean;
  effectiveVolume: number;
  audioSyncEnabled: boolean;
  onAudioSyncEnabledChange: (enabled: boolean) => void;
  playbackRate: number;
  currentTime: number;
  duration: number;
  canControlPlayback: boolean;
  isConnected: boolean;
  videoState: string;
  handlePlay: () => void;
  handlePause: () => void;
  handleSeekTo: (time: number) => void;
  handleSeekFromController: (time: number, opts?: { force?: boolean }) => void;
  handleVolumeChange: (volume: number) => void;
  handleLocalVolumeChange: (volume: number) => void;
  handleVolumeFromController: (volume: number, muted: boolean) => void;
  handlePlaybackRateChange: (rate: number) => void;
  handlePlaybackRateFromController: (rate: number) => void;
  toggleMute: () => void;
  toggleLocalMute: () => void;
  handleProgress: (time: number) => void;
  handleDuration: (dur: number) => void;

  onVideoEnded?: () => void;

  fullscreenChatOpen: boolean;
  setFullscreenChatOpen: React.Dispatch<React.SetStateAction<boolean>>;
  fullscreenChatMessages: Array<{
    msg: string;
    time: string;
    user: string;
  }>;
  chatText: string;
  setChatText: React.Dispatch<React.SetStateAction<string>>;
  handleSendChat: (e: React.FormEvent) => void;
}) {
  const ytLastProgressRef = React.useRef<{ t: number; at: number } | null>(
    null
  );

  React.useEffect(() => {
    ytLastProgressRef.current = null;
  }, [normalizedUrl]);
  const fullscreenChatPanelRef = React.useRef<HTMLDivElement | null>(null);
  const isDraggingChatRef = React.useRef(false);
  const dragOffsetRef = React.useRef<{ dx: number; dy: number } | null>(null);
  const [fullscreenChatPos, setFullscreenChatPos] = React.useState<{
    x: number;
    y: number;
  } | null>(null);
  const [fullscreenChatSize, setFullscreenChatSize] = React.useState<{
    w: number;
    h: number;
  } | null>(null);
  const isResizingChatRef = React.useRef(false);
  const resizeStartRef = React.useRef<{
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    posX: number;
    posY: number;
  } | null>(null);

  const [youtubePickerOpen, setYoutubePickerOpen] = React.useState(false);
  const [youtubeQuery, setYoutubeQuery] = React.useState("");
  const [youtubeResults, setYoutubeResults] = React.useState<
    YouTubeSearchItem[]
  >([]);
  const [youtubeLoading, setYoutubeLoading] = React.useState(false);
  const [youtubeError, setYoutubeError] = React.useState<string | null>(null);
  const [pendingYoutubeSelectUrl, setPendingYoutubeSelectUrl] = React.useState<
    string | null
  >(null);

  React.useEffect(() => {
    if (!pendingYoutubeSelectUrl) return;
    if (inputUrl !== pendingYoutubeSelectUrl) return;

    // Trigger the same logic as pressing the "Load" button.
    // This opens the preview modal; sharing happens only after confirm.
    handleUrlChange({ preventDefault() {} } as unknown as React.FormEvent);
    setPendingYoutubeSelectUrl(null);
  }, [pendingYoutubeSelectUrl, inputUrl, handleUrlChange]);

  const runYouTubeSearch = React.useCallback(async () => {
    const q = youtubeQuery.trim();
    if (!q) {
      setYoutubeError("Type something to search.");
      setYoutubeResults([]);
      return;
    }

    setYoutubeLoading(true);
    setYoutubeError(null);

    try {
      const res = await fetch(
        `/api/youtube-search?q=${encodeURIComponent(q)}&maxResults=12`,
        {
          cache: "no-store",
        }
      );

      const data = (await res
        .json()
        .catch(() => null)) as YouTubeSearchResponse | null;

      if (!data || typeof data !== "object") {
        setYoutubeError("Search failed.");
        setYoutubeResults([]);
        return;
      }

      if (data.ok) {
        setYoutubeResults(Array.isArray(data.items) ? data.items : []);
        setYoutubeError(null);
        return;
      }

      if (data.reason === "missing_key") {
        setYoutubeError(
          "YouTube browsing is not configured (missing YOUTUBE_API_KEY)."
        );
        setYoutubeResults([]);
        return;
      }

      if (data.reason === "quota") {
        setYoutubeError("YouTube API quota exceeded. Try again later.");
        setYoutubeResults([]);
        return;
      }

      setYoutubeError("Search failed.");
      setYoutubeResults([]);
    } catch {
      setYoutubeError("Network error while searching.");
      setYoutubeResults([]);
    } finally {
      setYoutubeLoading(false);
    }
  }, [youtubeQuery]);

  const clampChatPos = React.useCallback(
    (x: number, y: number) => {
      const container = playerContainerRef.current;
      const panel = fullscreenChatPanelRef.current;
      if (!container || !panel) return { x, y };

      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const pw = panel.offsetWidth;
      const ph = panel.offsetHeight;

      const padding = 12;
      const maxX = Math.max(padding, cw - pw - padding);
      const maxY = Math.max(padding, ch - ph - padding);

      return {
        x: Math.min(Math.max(padding, x), maxX),
        y: Math.min(Math.max(padding, y), maxY),
      };
    },
    [playerContainerRef]
  );

  const clampChatSize = React.useCallback(
    (w: number, h: number, x: number, y: number) => {
      const container = playerContainerRef.current;
      if (!container) return { w, h };

      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const padding = 12;

      const minW = 280;
      const minH = 200;

      const maxW = Math.max(minW, cw - x - padding);
      const maxH = Math.max(minH, ch - y - padding);

      return {
        w: Math.min(Math.max(minW, Math.round(w)), Math.round(maxW)),
        h: Math.min(Math.max(minH, Math.round(h)), Math.round(maxH)),
      };
    },
    [playerContainerRef]
  );

  React.useEffect(() => {
    // When chat opens in fullscreen, initialize position near bottom-right.
    if (!isPlayerFullscreen || !fullscreenChatOpen) return;
    if (fullscreenChatPos) return;

    const container = playerContainerRef.current;
    if (!container) return;

    const padding = 12;

    // Defer until panel has a size.
    const id = window.requestAnimationFrame(() => {
      const panel = fullscreenChatPanelRef.current;
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const pw = panel?.offsetWidth ?? 380;
      const ph = panel?.offsetHeight ?? 320;
      const initialPos = clampChatPos(cw - pw - padding, ch - ph - padding);
      setFullscreenChatPos(initialPos);

      const initialSize = clampChatSize(pw, ph, initialPos.x, initialPos.y);
      setFullscreenChatSize(initialSize);
    });

    return () => window.cancelAnimationFrame(id);
  }, [
    isPlayerFullscreen,
    fullscreenChatOpen,
    fullscreenChatPos,
    clampChatPos,
    clampChatSize,
    playerContainerRef,
  ]);

  React.useEffect(() => {
    // If we exit fullscreen or close chat, stop dragging.
    if (isPlayerFullscreen && fullscreenChatOpen) return;
    isDraggingChatRef.current = false;
    dragOffsetRef.current = null;
    isResizingChatRef.current = false;
    resizeStartRef.current = null;
  }, [isPlayerFullscreen, fullscreenChatOpen]);

  React.useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const container = playerContainerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();

      if (isDraggingChatRef.current) {
        const offset = dragOffsetRef.current;
        if (!offset) return;
        const x = e.clientX - rect.left - offset.dx;
        const y = e.clientY - rect.top - offset.dy;
        const next = clampChatPos(x, y);
        setFullscreenChatPos(next);
      }

      if (isResizingChatRef.current) {
        const start = resizeStartRef.current;
        if (!start) return;

        const dx = e.clientX - start.startX;
        const dy = e.clientY - start.startY;

        const proposedW = start.startW + dx;
        const proposedH = start.startH + dy;

        const nextSize = clampChatSize(
          proposedW,
          proposedH,
          start.posX,
          start.posY
        );
        setFullscreenChatSize(nextSize);
      }
    };

    const onUp = () => {
      if (isDraggingChatRef.current) {
        isDraggingChatRef.current = false;
        dragOffsetRef.current = null;
      }

      if (isResizingChatRef.current) {
        isResizingChatRef.current = false;
        resizeStartRef.current = null;
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [clampChatPos, clampChatSize, playerContainerRef]);

  React.useEffect(() => {
    // If size changes, make sure position remains valid.
    if (!fullscreenChatPos) return;
    const next = clampChatPos(fullscreenChatPos.x, fullscreenChatPos.y);
    if (next.x !== fullscreenChatPos.x || next.y !== fullscreenChatPos.y) {
      setFullscreenChatPos(next);
    }
  }, [fullscreenChatPos, fullscreenChatSize, clampChatPos]);

  type PlayerConfig = React.ComponentProps<typeof ReactPlayer>["config"];
  const playerConfig = React.useMemo(() => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : undefined;
    return {
      youtube: {
        playerVars: {
          autoplay: 1,
          controls: 1,
          fs: 0,
          rel: 0,
          modestbranding: 1,
          enablejsapi: 1,
          playsinline: 1,
          ...(origin ? { origin } : {}),
        },
      },
      file: {
        attributes: {
          crossOrigin: "anonymous",
        },
      },
    } as unknown as PlayerConfig;
  }, []);

  const clearLoadTimeout = React.useCallback(() => {
    if (loadTimeoutRef.current) {
      window.clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
  }, [loadTimeoutRef]);

  const isDirectFile = React.useMemo(() => {
    return /\.(mp4|webm|ogv|ogg)(\?|#|$)/i.test(normalizedUrl);
  }, [normalizedUrl]);

  const resumeToRoomTimeIfNeeded = React.useCallback(() => {
    const anchor = roomPlaybackAnchorRef.current;
    if (!anchor || !anchor.isPlaying) return;

    // Only try to resume if we're on the same media URL.
    if (anchor.url !== normalizedUrl) return;

    // Don't override user's manual seek for 5 seconds
    const timeSinceManualSeek = Date.now() - lastManualSeekRef.current;
    if (timeSinceManualSeek < 5000) return;

    const current = getCurrentTimeFromRef(playerRef);

    // Calculate expected position based on anchor - use full elapsed time for proper sync
    const elapsedSeconds = Math.max(0, (Date.now() - anchor.anchorAt) / 1000);
    const expected =
      anchor.anchorTime + elapsedSeconds * (anchor.playbackRate || 1);
    const target = Math.max(0, Math.min(expected, duration || Infinity));

    const drift = Math.abs(current - target);

    // ALWAYS sync if we're at the beginning (< 3 sec) but should be much further (> 5 sec ahead)
    // This handles the case where player loads after room state arrived
    const atBeginning = current < 3;
    const shouldBeFarAhead = target > 5;

    if (atBeginning && shouldBeFarAhead) {
      // Initial load - player wasn't ready when room state arrived, sync now
      applyingRemoteSyncRef.current = true;
      window.setTimeout(() => {
        applyingRemoteSyncRef.current = false;
      }, 300);

      seekToFromRef(playerRef, target);
      return;
    }

    // For normal cases, only sync if drift is significant
    if (drift <= 3) return;

    // Avoid redundant seeks if we just synced
    const timeSinceAnchor = Date.now() - anchor.anchorAt;
    if (timeSinceAnchor < 1000 && drift < 5) return;

    applyingRemoteSyncRef.current = true;
    window.setTimeout(() => {
      applyingRemoteSyncRef.current = false;
    }, 300);

    seekToFromRef(playerRef, target);
  }, [
    applyingRemoteSyncRef,
    duration,
    lastManualSeekRef,
    normalizedUrl,
    playerRef,
    roomPlaybackAnchorRef,
  ]);

  React.useEffect(() => {
    if (!isDirectFile) return;

    const el = getHtmlMediaElementFromRef(playerRef);
    if (el) {
      try {
        el.muted = effectiveMuted;
        // Keep volume in sync when unmuted.
        if (!effectiveMuted) el.volume = effectiveVolume;
        el.playbackRate = playbackRate;
      } catch {
        // ignore
      }
    }

    if (videoState === "Playing") {
      void playFromRef(playerRef);
    } else {
      pauseFromRef(playerRef);
    }
  }, [
    isDirectFile,
    playerRef,
    effectiveMuted,
    effectiveVolume,
    playbackRate,
    videoState,
  ]);

  const onEmbedLoad = () => {
    setPlayerReady(true);
    setPlayerError(null);
    setIsBuffering(false);
    clearLoadTimeout();
  };

  // For YouTube, avoid swapping the iframe `src` for every playlist item.
  // Swapping `src` is what triggers autoplay gating in background and makes
  // the next track sit at 0:00 until the tab regains focus.
  const isYouTube = React.useMemo(
    () => isYouTubeUrl(normalizedUrl),
    [normalizedUrl]
  );
  const useYouTubeIFrameApi = React.useMemo(() => {
    // Default ON: persistent official IFrame API player.
    // Opt-out via localStorage for debugging: huddle:ytIFrameApi = "0".
    if (typeof window === "undefined") return true;
    try {
      return window.localStorage.getItem("huddle:ytIFrameApi") !== "0";
    } catch {
      return true;
    }
  }, []);
  const debugYouTube = React.useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("huddle:debugYouTube") === "1";
    } catch {
      return false;
    }
  }, []);
  const [youtubeMountUrl, setYoutubeMountUrl] = React.useState<string | null>(
    null
  );
  const ytRequestedIdRef = React.useRef<string | null>(null);
  const ytConfirmedIdRef = React.useRef<string | null>(null);
  const [ytConfirmedId, setYtConfirmedId] = React.useState<string | null>(null);
  const [ytForceRemountNonce, setYtForceRemountNonce] = React.useState(0);
  const [ytUseStableIframe, setYtUseStableIframe] = React.useState(() => {
    // Default OFF: stable-iframe mode depends on the YouTube internal player API
    // being available, which can be blocked by privacy settings/extensions and
    // causes timeouts. Users can opt in for background-play experiments.
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("huddle:ytStableIframe") === "1";
    } catch {
      return false;
    }
  });
  const ytLastForcedRemountIdRef = React.useRef<string | null>(null);
  const ytVisibleStuckRemountIdRef = React.useRef<string | null>(null);
  const ytVisibleStuckAttemptsRef = React.useRef(0);
  const ytLastUserRecoverAtRef = React.useRef(0);
  const ytLastNormalizedUrlRef = React.useRef<string | null>(null);
  const ytUrlChangedWhileVisibleRef = React.useRef<boolean>(true);
  const [ytAudioBlockedInBackground, setYtAudioBlockedInBackground] =
    React.useState(false);

  const [isPageVisible, setIsPageVisible] = React.useState(true);
  React.useEffect(() => {
    if (!isClient) return;
    const update = () => {
      setIsPageVisible(
        typeof document === "undefined" || document.visibilityState !== "hidden"
      );
    };
    update();
    document.addEventListener("visibilitychange", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
    };
  }, [isClient]);

  // When returning to visible, try to immediately restore audio if the browser
  // blocked background unmute on the next item.
  React.useEffect(() => {
    if (!isClient) return;
    if (!isYouTube) return;
    if (!isPageVisible) return;
    if (!ytAudioBlockedInBackground) return;

    const wrapper = playerRef.current as
      | {
          getInternalPlayer?: () => unknown;
        }
      | null
      | undefined;
    const internal = wrapper?.getInternalPlayer?.() as
      | {
          unMute?: () => void;
          setVolume?: (vol: number) => void;
          isMuted?: () => unknown;
          playVideo?: () => void;
        }
      | null
      | undefined;

    try {
      if (!internal) return;
      if (!effectiveMuted && effectiveVolume > 0) {
        internal.unMute?.();
        internal.setVolume?.(
          Math.max(0, Math.min(100, Math.round(effectiveVolume * 100)))
        );
        if (videoState === "Playing") internal.playVideo?.();
      }
    } catch {
      // ignore
    } finally {
      setYtAudioBlockedInBackground(false);
    }
  }, [
    isClient,
    isYouTube,
    isPageVisible,
    ytAudioBlockedInBackground,
    playerRef,
    effectiveMuted,
    effectiveVolume,
    videoState,
  ]);

  // Track whether the most recent YouTube URL change happened while the page
  // was visible. If the URL changed while hidden (background playlist advance),
  // we avoid remounting the iframe on return, which would restart playback.
  React.useEffect(() => {
    if (!isClient) return;
    if (useYouTubeIFrameApi) return;
    if (!isYouTube) {
      ytLastNormalizedUrlRef.current = null;
      ytUrlChangedWhileVisibleRef.current = true;
      return;
    }

    const prev = ytLastNormalizedUrlRef.current;
    if (prev !== normalizedUrl) {
      ytLastNormalizedUrlRef.current = normalizedUrl;
      ytUrlChangedWhileVisibleRef.current = isPageVisible;
    }
  }, [isClient, isYouTube, normalizedUrl, isPageVisible, useYouTubeIFrameApi]);

  React.useEffect(() => {
    if (!isClient) return;
    if (useYouTubeIFrameApi) return;
    if (!isYouTube) {
      if (youtubeMountUrl !== null) {
        setYoutubeMountUrl(null);
        ytRequestedIdRef.current = null;
        ytConfirmedIdRef.current = null;
        setYtConfirmedId(null);
        setYtUseStableIframe(true);
        ytLastForcedRemountIdRef.current = null;
        ytLastNormalizedUrlRef.current = null;
        ytUrlChangedWhileVisibleRef.current = true;
      }
      return;
    }

    // When stable-iframe mode is disabled (fallback), always mount the current URL.
    if (!ytUseStableIframe) {
      if (normalizedUrl && youtubeMountUrl !== normalizedUrl) {
        setYoutubeMountUrl(normalizedUrl);
        ytRequestedIdRef.current = null;
        ytConfirmedIdRef.current = null;
        setYtConfirmedId(null);
        ytLastForcedRemountIdRef.current = null;
      }
      return;
    }

    // When visible, prefer remounting the iframe for reliability (manual/foreground switches).
    // When hidden, keep a stable iframe and switch via IFrame API (background-friendly).
    if (youtubeMountUrl === null && normalizedUrl) {
      setYoutubeMountUrl(normalizedUrl);
      return;
    }

    if (
      isPageVisible &&
      ytUrlChangedWhileVisibleRef.current &&
      normalizedUrl &&
      youtubeMountUrl !== normalizedUrl
    ) {
      setYoutubeMountUrl(normalizedUrl);
      ytRequestedIdRef.current = null;
      ytConfirmedIdRef.current = null;
      setYtConfirmedId(null);
      ytLastForcedRemountIdRef.current = null;
    }
  }, [
    isClient,
    isYouTube,
    normalizedUrl,
    youtubeMountUrl,
    isPageVisible,
    useYouTubeIFrameApi,
    ytUseStableIframe,
  ]);

  const playerSrc =
    isYouTube && !useYouTubeIFrameApi
      ? (youtubeMountUrl ?? normalizedUrl)
      : normalizedUrl;
  const reactPlayerSrc = isYouTube
    ? playerSrc
    : canPlay
      ? playerSrc
      : undefined;

  const youTubeDesiredId = React.useMemo(
    () => (isYouTube ? getYouTubeVideoId(normalizedUrl) : null),
    [isYouTube, normalizedUrl]
  );
  const youTubeIsOnDesired =
    !isYouTube ||
    !youTubeDesiredId ||
    useYouTubeIFrameApi ||
    !ytUseStableIframe ||
    ytConfirmedId === youTubeDesiredId;

  // If we're visible and the room is "Playing" but the player isn't on the
  // desired YouTube id, ReactPlayer will keep itself paused (by design). That
  // pause can cascade into handlePause() and permanently wedge controls.
  // In that state, force-remount once per target id to recover.
  React.useEffect(() => {
    if (!isClient) return;
    if (!isYouTube) return;
    if (useYouTubeIFrameApi) return;
    if (!ytUseStableIframe) return;
    if (!isPageVisible) return;
    if (videoState !== "Playing") return;
    if (youTubeIsOnDesired) {
      ytVisibleStuckRemountIdRef.current = null;
      ytVisibleStuckAttemptsRef.current = 0;
      return;
    }

    const targetId = youTubeDesiredId;
    if (!targetId) return;
    if (ytVisibleStuckRemountIdRef.current === targetId) return;

    let cancelled = false;
    let timer: number | null = null;

    const probe = () => {
      if (cancelled) return;
      if (videoState !== "Playing") return;
      if (ytConfirmedId === targetId) return;

      const wrapper = playerRef.current as
        | {
            getInternalPlayer?: () => unknown;
          }
        | null
        | undefined;
      const internal = wrapper?.getInternalPlayer?.() as
        | {
            getVideoData?: () => unknown;
            getVideoUrl?: () => unknown;
          }
        | null
        | undefined;

      const internalPresent = Boolean(internal);

      const nowId = (() => {
        try {
          const data = internal?.getVideoData?.() as
            | { video_id?: unknown }
            | null
            | undefined;
          const vid =
            typeof data?.video_id === "string" && data.video_id
              ? data.video_id
              : null;
          if (vid) return vid;

          const url = internal?.getVideoUrl?.();
          if (typeof url === "string" && url) return getYouTubeVideoId(url);
        } catch {
          // ignore
        }
        return null;
      })();

      // If internal isn't ready yet, keep probing briefly instead of forcing a remount.
      if (!internalPresent) {
        ytVisibleStuckAttemptsRef.current += 1;
        if (ytVisibleStuckAttemptsRef.current < 30) {
          timer = window.setTimeout(probe, 350);
          return;
        }

        // The player hasn't even exposed its internal API yet.
        // If this persists, stable-iframe mode is not viable in this session.
        // Fall back to legacy remount-per-URL behavior so playback can proceed.
        if (ytUseStableIframe) {
          console.warn(
            "[yt] stable iframe mode failed; falling back to remount mode",
            {
              targetId,
              normalizedUrl,
              attempts: ytVisibleStuckAttemptsRef.current,
            }
          );
          setYtUseStableIframe(false);
          setYtForceRemountNonce((n) => n + 1);
          ytVisibleStuckAttemptsRef.current = 0;
          return;
        }

        // Otherwise, back off and try again later.
        console.warn(
          "[yt] internal player not available yet; delaying recovery",
          {
            targetId,
            normalizedUrl,
            canPlay,
            playerSrc,
            attempts: ytVisibleStuckAttemptsRef.current,
          }
        );
        ytVisibleStuckAttemptsRef.current = 0;
        timer = window.setTimeout(probe, 2000);
        return;
      }

      // If a switch request is in-flight, give it more time before remounting.
      const switchInProgress =
        ytRequestedIdRef.current === targetId && ytConfirmedId !== targetId;
      if (switchInProgress) {
        ytVisibleStuckAttemptsRef.current += 1;
        if (ytVisibleStuckAttemptsRef.current < 12) {
          timer = window.setTimeout(probe, 450);
          return;
        }
      }

      ytVisibleStuckRemountIdRef.current = targetId;
      ytLastForcedRemountIdRef.current = targetId;

      // Reset confirmation and force an actual remount.
      ytRequestedIdRef.current = null;
      ytConfirmedIdRef.current = null;
      setYtConfirmedId(null);
      setPlayerReady(false);
      setIsBuffering(true);
      setYoutubeMountUrl(normalizedUrl);
      setYtForceRemountNonce((n) => n + 1);

      console.warn(
        "[yt] stuck not on desired id while Playing; forcing remount",
        {
          targetId,
          nowId,
          internalPresent,
          normalizedUrl,
        }
      );
    };

    ytVisibleStuckAttemptsRef.current = 0;
    timer = window.setTimeout(probe, 900);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [
    isClient,
    isYouTube,
    isPageVisible,
    videoState,
    youTubeIsOnDesired,
    youTubeDesiredId,
    ytConfirmedId,
    normalizedUrl,
    useYouTubeIFrameApi,
    ytUseStableIframe,
    canPlay,
    playerSrc,
    playerRef,
    setPlayerReady,
    setIsBuffering,
  ]);

  // When the room URL changes to a new YouTube video, switch it using the
  // existing YT player instance.
  React.useEffect(() => {
    if (!isClient) return;
    if (!isYouTube) return;
    if (useYouTubeIFrameApi) return;

    const targetId = getYouTubeVideoId(normalizedUrl);
    if (!targetId) return;

    // If we've already confirmed we're on the desired id, don't let transient
    // failures (getVideoData/getVideoUrl returning null) pause playback.
    const isAlreadyConfirmed =
      ytConfirmedIdRef.current === targetId || ytConfirmedId === targetId;

    let cancelled = false;
    let retryTimer: number | null = null;

    const tryLoad = () => {
      if (cancelled) return;

      const wrapper = playerRef.current as
        | {
            getInternalPlayer?: () => unknown;
          }
        | null
        | undefined;

      const internal = wrapper?.getInternalPlayer?.() as
        | {
            loadVideoById?: (id: string) => void;
            cueVideoById?: (id: string) => void;
            playVideo?: () => void;
            getVideoData?: () => unknown;
            getVideoUrl?: () => unknown;
            getIframe?: () => unknown;
          }
        | null
        | undefined;

      if (
        !internal ||
        (typeof internal.loadVideoById !== "function" &&
          typeof internal.cueVideoById !== "function")
      ) {
        retryTimer = window.setTimeout(tryLoad, 250);
        return;
      }

      // During remounts, ReactPlayer can briefly hand us an internal player
      // whose iframe isn't attached yet. Calling loadVideoById/cueVideoById in
      // that state triggers the YT warning and can prevent playback.
      const iframeConnected = (() => {
        try {
          const iframe = internal.getIframe?.() as
            | { isConnected?: unknown }
            | null
            | undefined;
          if (!iframe) return true;
          if (typeof iframe.isConnected === "boolean")
            return iframe.isConnected;
        } catch {
          // ignore
        }
        return true;
      })();

      if (!iframeConnected) {
        retryTimer = window.setTimeout(tryLoad, 250);
        return;
      }

      // Verify current video id so we don't accidentally restart an old video.
      const currentId = (() => {
        try {
          const data = internal.getVideoData?.() as
            | { video_id?: unknown }
            | null
            | undefined;
          const vid =
            typeof data?.video_id === "string" && data.video_id
              ? data.video_id
              : null;
          if (vid) return vid;

          const url = internal.getVideoUrl?.();
          if (typeof url === "string" && url) return getYouTubeVideoId(url);
        } catch {
          // ignore
        }
        return null;
      })();

      if (currentId === targetId) {
        ytConfirmedIdRef.current = targetId;
        ytRequestedIdRef.current = targetId;
        setYtConfirmedId(targetId);
        // We may have set playerReady=false when the room URL changed. In the
        // stable-iframe approach, onReady does not fire again; mark ready here.
        setPlayerReady(true);
        setPlayerError(null);
        setIsBuffering(false);
        clearLoadTimeout();
        return;
      }

      // If YouTube can't report the current id right now but we already
      // confirmed the target, keep playing.
      if (currentId === null && isAlreadyConfirmed) {
        ytRequestedIdRef.current = targetId;
        setPlayerReady(true);
        setPlayerError(null);
        setIsBuffering(false);
        clearLoadTimeout();
        return;
      }

      // Track what we WANT, but don't mark as confirmed until we verify.
      ytRequestedIdRef.current = targetId;
      if (!isAlreadyConfirmed) {
        ytConfirmedIdRef.current = null;
        setYtConfirmedId(null);
      }

      if (debugYouTube) {
        console.debug("[yt] switching video via IFrame API", {
          targetId,
          videoState,
          normalizedUrl,
          currentId,
        });
      }

      let attempts = 0;

      const requestSwitch = () => {
        attempts += 1;
        try {
          if (videoState === "Playing") {
            (internal.loadVideoById ?? internal.cueVideoById)?.(targetId);
          } else {
            (internal.cueVideoById ?? internal.loadVideoById)?.(targetId);
          }
        } catch (e) {
          if (debugYouTube) {
            console.debug("[yt] loadVideoById/cueVideoById failed", e);
          }
        }
      };

      const verifyAndMaybeRetry = () => {
        if (cancelled) return;

        const nowId = (() => {
          try {
            const data = internal.getVideoData?.() as
              | { video_id?: unknown }
              | null
              | undefined;
            const vid =
              typeof data?.video_id === "string" && data.video_id
                ? data.video_id
                : null;
            if (vid) return vid;

            const url = internal.getVideoUrl?.();
            if (typeof url === "string" && url) return getYouTubeVideoId(url);
          } catch {
            // ignore
          }
          return null;
        })();

        if (debugYouTube) {
          console.debug("[yt] verify", {
            targetId,
            nowId,
            attempts,
            videoState,
          });
        }

        if (nowId === targetId) {
          ytConfirmedIdRef.current = targetId;
          setYtConfirmedId(targetId);
          setPlayerReady(true);
          setPlayerError(null);
          setIsBuffering(false);
          clearLoadTimeout();
          // Only kick play once the *target* is actually loaded.
          if (videoState === "Playing") {
            try {
              internal.playVideo?.();
            } catch {
              // ignore
            }
          }
          return;
        }

        if (attempts >= 6) {
          // Internal switching sometimes fails (autoplay policy / transient YT
          // issues). As a last resort, force-remount the iframe to the new URL.
          // This restores manual switching reliability.
          if (ytLastForcedRemountIdRef.current !== targetId) {
            ytLastForcedRemountIdRef.current = targetId;
            if (debugYouTube) {
              console.debug(
                "[yt] forcing iframe remount after failed switches",
                {
                  targetId,
                  normalizedUrl,
                  attempts,
                }
              );
            }
            // Only update if it would actually change.
            setYoutubeMountUrl((prev) =>
              prev === normalizedUrl ? prev : normalizedUrl
            );
          }
          return;
        }

        requestSwitch();
        retryTimer = window.setTimeout(verifyAndMaybeRetry, 500);
      };

      requestSwitch();
      retryTimer = window.setTimeout(verifyAndMaybeRetry, 500);
    };

    tryLoad();

    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [
    isClient,
    isYouTube,
    ytUseStableIframe,
    normalizedUrl,
    playerRef,
    videoState,
    debugYouTube,
    useYouTubeIFrameApi,
    ytConfirmedId,
    setPlayerReady,
    setPlayerError,
    setIsBuffering,
    clearLoadTimeout,
  ]);

  // YouTube background-safe ended detection:
  // ReactPlayer's `onEnded` can be unreliable when autoplay restrictions kick in
  // after a URL change while the tab is unfocused. The IFrame API emits
  // onStateChange(ENDED=0) even in the background.
  const ytEndedAtRef = React.useRef(0);
  const ytEnsurePlayAtRef = React.useRef(0);
  const ytEnsureAudioAtRef = React.useRef(0);
  const ytHiddenSwitchAtRef = React.useRef(0);
  React.useEffect(() => {
    if (!isClient) return;
    if (!isYouTube) return;
    if (useYouTubeIFrameApi) return;

    let cancelled = false;
    let attachTimer: number | null = null;

    const tryAttach = () => {
      if (cancelled) return;

      const wrapper = playerRef.current as
        | {
            getInternalPlayer?: () => unknown;
          }
        | null
        | undefined;

      const internal = wrapper?.getInternalPlayer?.() as
        | {
            addEventListener?: (evt: string, cb: (e: unknown) => void) => void;
            removeEventListener?: (
              evt: string,
              cb: (e: unknown) => void
            ) => void;
            playVideo?: () => void;
            loadVideoById?: (id: string) => void;
            cueVideoById?: (id: string) => void;
            getVideoData?: () => unknown;
            getVideoUrl?: () => unknown;
            getPlayerState?: () => unknown;
            mute?: () => void;
            unMute?: () => void;
            isMuted?: () => unknown;
            setVolume?: (vol: number) => void;
            getVolume?: () => unknown;
          }
        | null
        | undefined;

      if (!internal || typeof internal.addEventListener !== "function") {
        // ReactPlayer may not have created the IFrame player yet; retry briefly.
        attachTimer = window.setTimeout(tryAttach, 250);
        return;
      }

      const ensurePlayingIfExpected = () => {
        if (applyingRemoteSyncRef.current) return;
        if (videoState !== "Playing") return;

        // Don't restart an old video at its end; only kick play if the internal
        // player is already on the URL's intended video id.
        const desiredId = getYouTubeVideoId(normalizedUrl);
        if (!desiredId) return;
        // Only kick play if the internal player is already on the desired video.
        // Otherwise this can restart the previous video at its end.
        const currentId = (() => {
          try {
            const data = internal.getVideoData?.() as
              | { video_id?: unknown }
              | null
              | undefined;
            const vid =
              typeof data?.video_id === "string" && data.video_id
                ? data.video_id
                : null;
            if (vid) return vid;

            const url = internal.getVideoUrl?.();
            if (typeof url === "string" && url) return getYouTubeVideoId(url);
          } catch {
            // ignore
          }
          return null;
        })();

        if (currentId !== desiredId) {
          if (debugYouTube) {
            console.debug("[yt] skip kick; not on desired id", {
              desiredId,
              currentId,
              requested: ytRequestedIdRef.current,
              confirmed: ytConfirmedIdRef.current,
            });
          }
          return;
        }

        const ensureAudioIfExpected = () => {
          if (applyingRemoteSyncRef.current) return;
          if (videoState !== "Playing") return;

          const now = Date.now();
          if (now - ytEnsureAudioAtRef.current < 2000) return;
          ytEnsureAudioAtRef.current = now;

          try {
            if (effectiveMuted) {
              internal.mute?.();
              return;
            }

            // Best-effort: some browsers/YouTube policies may still prevent
            // unmuting without a user gesture, but this helps when it *is*
            // allowed and the next video starts muted.
            internal.unMute?.();

            const vol = Math.max(
              0,
              Math.min(100, Math.round(effectiveVolume * 100))
            );
            if (vol > 0) internal.setVolume?.(vol);

            // If we're hidden and unmute is being ignored, it's almost always
            // a browser autoplay policy requiring a user gesture.
            if (!isPageVisible) {
              const muted = internal.isMuted?.();
              if (muted === true) {
                setYtAudioBlockedInBackground(true);
              }
            }
          } catch {
            // ignore
          }
        };

        ensureAudioIfExpected();

        const now = Date.now();
        if (now - ytEnsurePlayAtRef.current < 1200) return;
        ytEnsurePlayAtRef.current = now;

        try {
          internal.playVideo?.();
        } catch {
          // ignore
        }
      };

      const onStateChange = (ev: unknown) => {
        const data = (ev as { data?: unknown } | null)?.data;
        // YouTube IFrame API: ENDED === 0
        if (data !== 0) return;

        const now = Date.now();
        if (now - ytEndedAtRef.current < 1500) return;
        ytEndedAtRef.current = now;

        onVideoEnded?.();
      };

      // If the next track loads while the tab is unfocused, YouTube may sit in
      // CUED (5) or UNSTARTED (-1) until the user refocuses. Kick playVideo.
      const onStateChangeWithKick = (ev: unknown) => {
        const data = (ev as { data?: unknown } | null)?.data;
        if (data === 0) {
          onStateChange(ev);
          return;
        }

        // -1: unstarted, 5: cued
        if (data === -1 || data === 5) {
          if (debugYouTube) {
            console.debug("[yt] state", { data, videoState, normalizedUrl });
          }
          ensurePlayingIfExpected();
        }
      };

      try {
        internal.addEventListener("onStateChange", onStateChangeWithKick);
      } catch {
        // ignore
      }

      // Background fallback: in hidden tabs, YouTube may not reliably fire
      // statechange events. Poll player state and kick play when needed.
      let pollTimer: number | null = null;
      const startPoll = () => {
        if (pollTimer) return;
        pollTimer = window.setInterval(() => {
          if (cancelled) return;
          if (isPageVisible) return;
          if (applyingRemoteSyncRef.current) return;
          if (videoState !== "Playing") return;

          const desiredId = getYouTubeVideoId(normalizedUrl);
          if (!desiredId) return;

          const currentId = (() => {
            try {
              const data = internal.getVideoData?.() as
                | { video_id?: unknown }
                | null
                | undefined;
              const vid =
                typeof data?.video_id === "string" && data.video_id
                  ? data.video_id
                  : null;
              if (vid) return vid;

              const url = internal.getVideoUrl?.();
              if (typeof url === "string" && url) return getYouTubeVideoId(url);
            } catch {
              // ignore
            }
            return null;
          })();

          if (currentId !== desiredId) {
            // Attempt to advance the internal player to the desired item.
            // Background tabs can throttle timeouts heavily, so do a periodic
            // best-effort switch here.
            const now = Date.now();
            if (now - ytHiddenSwitchAtRef.current < 2500) return;
            ytHiddenSwitchAtRef.current = now;

            if (debugYouTube) {
              console.debug("[yt] hidden poll switch", {
                desiredId,
                currentId,
                normalizedUrl,
              });
            }

            try {
              (internal.loadVideoById ?? internal.cueVideoById)?.(desiredId);
            } catch {
              // ignore
            }
            return;
          }

          // If we're on the desired item but audio is missing in background,
          // try to re-assert unmute/volume before (or while) kicking play.
          if (!effectiveMuted && effectiveVolume > 0) {
            const now = Date.now();
            if (now - ytEnsureAudioAtRef.current >= 2000) {
              ytEnsureAudioAtRef.current = now;
              try {
                internal.unMute?.();
                internal.setVolume?.(
                  Math.max(0, Math.min(100, Math.round(effectiveVolume * 100)))
                );

                const muted = internal.isMuted?.();
                if (muted === true) {
                  setYtAudioBlockedInBackground(true);
                }
              } catch {
                // ignore
              }
            }
          }

          const st = internal.getPlayerState?.();
          // YouTube states: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
          if (st === 1) return;
          if (st === 0) return;

          const now = Date.now();
          if (now - ytEnsurePlayAtRef.current < 1500) return;
          ytEnsurePlayAtRef.current = now;

          if (debugYouTube) {
            console.debug("[yt] hidden poll kick", {
              st,
              desiredId,
              normalizedUrl,
            });
          }

          try {
            internal.playVideo?.();
          } catch {
            // ignore
          }
        }, 2000);
      };
      startPoll();

      return () => {
        if (pollTimer) {
          window.clearInterval(pollTimer);
          pollTimer = null;
        }
        try {
          internal.removeEventListener?.(
            "onStateChange",
            onStateChangeWithKick
          );
        } catch {
          // ignore
        }
      };
    };

    const detach = tryAttach();

    return () => {
      cancelled = true;
      if (attachTimer) window.clearTimeout(attachTimer);
      if (typeof detach === "function") detach();
    };
  }, [
    isClient,
    isYouTube,
    isPageVisible,
    normalizedUrl,
    onVideoEnded,
    playerRef,
    videoState,
    applyingRemoteSyncRef,
    debugYouTube,
    effectiveMuted,
    effectiveVolume,
    useYouTubeIFrameApi,
  ]);

  return (
    <section className="flex flex-col gap-6 lg:col-start-2 lg:row-start-1 lg:min-w-0">
      <div className="backdrop-blur-md bg-white/5 rounded-2xl border border-white/10 p-4 sm:p-5">
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <div className="font-semibold text-slate-50">Video source</div>
              <div className="text-xs text-slate-400 mt-1">
                Paste a link (YouTube/Twitch/Kick/Netflix) or a direct file URL
                (MP4/WebM).
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <span className="px-2 py-1 rounded-full text-[11px] border border-white/10 bg-black/20 text-slate-300">
                YouTube
              </span>
              <span className="px-2 py-1 rounded-full text-[11px] border border-white/10 bg-black/20 text-slate-300">
                Twitch
              </span>
              <span className="px-2 py-1 rounded-full text-[11px] border border-white/10 bg-black/20 text-slate-300">
                Kick
              </span>
              <span className="px-2 py-1 rounded-full text-[11px] border border-white/10 bg-black/20 text-slate-300">
                Netflix
              </span>
              <span className="px-2 py-1 rounded-full text-[11px] border border-white/10 bg-black/20 text-slate-300">
                Prime
              </span>
            </div>
          </div>

          <form onSubmit={handleUrlChange} className="flex gap-2 w-full">
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="e.g. youtube.com/watch?v=..., netflix.com/watch/..."
              className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/40 transition"
            />
            <button
              type="button"
              onClick={() => {
                setYoutubePickerOpen((v) => !v);
                setYoutubeError(null);
              }}
              className="h-11 px-4 bg-black/20 hover:bg-black/30 border border-white/10 rounded-xl transition-colors text-sm font-medium text-slate-50"
              title="Search YouTube and load into the room"
            >
              Browse YouTube
            </button>
            <button
              type="button"
              onClick={() => {
                // YouTube blocks embedding the full site in iframes (X-Frame-Options/CSP).
                // Opening in a new tab lets users log in and choose recommendations.
                window.open(
                  "https://www.youtube.com",
                  "_blank",
                  "noopener,noreferrer"
                );
              }}
              className="h-11 px-4 bg-black/20 hover:bg-black/30 border border-white/10 rounded-xl transition-colors text-sm font-medium text-slate-50"
              title="Open YouTube in a new tab to pick from your recommendations"
            >
              Open YouTube
            </button>
            <button
              type="submit"
              className="h-11 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors text-sm font-medium text-slate-50"
            >
              Load
            </button>
          </form>

          {youtubePickerOpen && (
            <div className="mt-2 rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={youtubeQuery}
                  onChange={(e) => setYoutubeQuery(e.target.value)}
                  placeholder="Search YouTube..."
                  className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/40 transition"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void runYouTubeSearch();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => void runYouTubeSearch()}
                  disabled={youtubeLoading}
                  className="h-11 px-4 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:hover:bg-white/5 border border-white/10 rounded-xl transition-colors text-sm font-medium text-slate-50"
                >
                  {youtubeLoading ? "Searching..." : "Search"}
                </button>
                <button
                  type="button"
                  onClick={() => setYoutubePickerOpen(false)}
                  className="h-11 px-4 bg-black/20 hover:bg-black/30 border border-white/10 rounded-xl transition-colors text-sm font-medium text-slate-50"
                >
                  Close
                </button>
              </div>

              {youtubeError && (
                <div className="mt-2 text-xs text-rose-300">{youtubeError}</div>
              )}

              {youtubeResults.length > 0 && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {youtubeResults.map((it) => (
                    <button
                      key={it.videoId}
                      type="button"
                      onClick={() => {
                        const next = `https://www.youtube.com/watch?v=${it.videoId}`;
                        setPendingYoutubeSelectUrl(next);
                        setInputUrl(next);
                        setYoutubePickerOpen(false);
                      }}
                      className="text-left rounded-xl border border-white/10 bg-black/20 hover:bg-black/30 transition-colors overflow-hidden"
                      title="Select this video"
                    >
                      <div className="aspect-video bg-black/30">
                        {it.thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={it.thumbnail}
                            alt={it.title}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full" />
                        )}
                      </div>
                      <div className="p-2">
                        <div className="text-sm font-semibold text-slate-100 line-clamp-2">
                          {it.title}
                        </div>
                        {it.channelTitle && (
                          <div className="text-xs text-slate-400 mt-1 line-clamp-1">
                            {it.channelTitle}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {youtubeResults.length === 0 &&
                !youtubeLoading &&
                !youtubeError && (
                  <div className="mt-2 text-xs text-slate-400">
                    Search and click a video to open the preview. After you
                    confirm, it becomes the room video.
                  </div>
                )}
            </div>
          )}
        </div>
      </div>

      <div
        className={`w-full aspect-video bg-black/40 rounded-2xl relative overflow-hidden border border-white/10 ${
          isStageDragOver ? "ring-2 ring-indigo-500/30" : ""
        }`}
        ref={playerContainerRef}
      >
        <div className="absolute top-3 right-3 z-50 flex items-center gap-2">
          {isPlayerFullscreen && (
            <button
              type="button"
              onClick={() => setFullscreenChatOpen((v) => !v)}
              className="h-10 px-4 rounded-xl border border-white/20 bg-black/50 text-slate-50 text-sm font-semibold hover:bg-white/10 transition-colors"
              title={fullscreenChatOpen ? "Hide chat" : "Show chat"}
            >
              {fullscreenChatOpen ? "Hide chat" : "Chat"}
            </button>
          )}

          <button
            type="button"
            onClick={togglePlayerFullscreen}
            className="h-10 px-4 rounded-xl border border-white/20 bg-slate-50 text-slate-950 text-sm font-semibold hover:bg-slate-50/90 transition-colors shadow-sm"
            title="Fullscreen (with webcams)"
          >
            {isPlayerFullscreen ? "Exit" : "Fullscreen"}
          </button>
        </div>

        {isPlayerFullscreen && fullscreenChatOpen && (
          <>
            <div className="absolute z-50 fullscreenChatPanel">
              <div
                ref={fullscreenChatPanelRef}
                className="rounded-2xl border border-white/10 bg-black/50 backdrop-blur-md overflow-hidden h-full flex flex-col"
              >
                <div
                  className="px-4 py-3 border-b border-white/10 bg-black/20 flex items-center justify-between select-none cursor-move"
                  onPointerDown={(e) => {
                    const container = playerContainerRef.current;
                    const panel = fullscreenChatPanelRef.current;
                    if (!container || !panel) return;
                    if (e.button !== 0) return;

                    // Compute offset from panel top-left.
                    const rect = container.getBoundingClientRect();
                    const current = fullscreenChatPos ?? { x: 12, y: 12 };
                    const dx = e.clientX - rect.left - current.x;
                    const dy = e.clientY - rect.top - current.y;
                    dragOffsetRef.current = { dx, dy };
                    isDraggingChatRef.current = true;
                    try {
                      (e.currentTarget as HTMLElement).setPointerCapture(
                        e.pointerId
                      );
                    } catch {
                      // ignore
                    }
                  }}
                >
                  <div className="text-sm font-semibold text-slate-50">
                    Chat
                  </div>
                  <button
                    type="button"
                    onClick={() => setFullscreenChatOpen(false)}
                    className="h-8 px-3 rounded-xl border border-white/10 bg-white/5 text-slate-100 text-xs font-semibold hover:bg-white/10 transition-colors"
                  >
                    Close
                  </button>
                </div>

                <div className="p-3 flex-1 min-h-0 overflow-y-auto space-y-2">
                  {fullscreenChatMessages.length === 0 ? (
                    <div className="text-sm text-slate-500">
                      No messages yet.
                    </div>
                  ) : (
                    fullscreenChatMessages.map((m, idx) => (
                      <div
                        key={`${idx}:${m.time}:${m.user}`}
                        className="text-sm text-slate-200"
                      >
                        <span className="text-slate-400 text-xs mr-2">
                          {m.time}
                        </span>
                        <strong className="text-slate-50">{m.user}</strong>{" "}
                        <span className="text-slate-200">{m.msg}</span>
                      </div>
                    ))
                  )}
                </div>

                <form
                  onSubmit={handleSendChat}
                  className="p-3 border-t border-white/10 bg-black/20 flex gap-2"
                >
                  <input
                    type="text"
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    placeholder={
                      isConnected ? "Type a message���" : "Connecting���"
                    }
                    disabled={!isConnected}
                    className="flex-1 h-10 bg-black/30 border border-white/10 rounded-xl px-3 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/25 focus:border-sky-500/30 transition disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={!isConnected || !chatText.trim()}
                    className="h-10 px-4 rounded-xl border border-white/10 bg-white/5 text-slate-50 text-sm font-semibold hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Send
                  </button>
                </form>

                <div
                  className="absolute right-2 bottom-2 z-10 w-4 h-4 cursor-se-resize"
                  onPointerDown={(e) => {
                    const container = playerContainerRef.current;
                    if (!container) return;
                    if (e.button !== 0) return;
                    e.preventDefault();
                    e.stopPropagation();

                    const pos = fullscreenChatPos ?? { x: 12, y: 12 };
                    const size = fullscreenChatSize ?? { w: 380, h: 320 };

                    isResizingChatRef.current = true;
                    resizeStartRef.current = {
                      startX: e.clientX,
                      startY: e.clientY,
                      startW: size.w,
                      startH: size.h,
                      posX: pos.x,
                      posY: pos.y,
                    };
                    try {
                      (e.currentTarget as HTMLElement).setPointerCapture(
                        e.pointerId
                      );
                    } catch {
                      // ignore
                    }
                  }}
                  title="Resize"
                >
                  <div className="w-full h-full rounded border border-white/20 bg-white/10" />
                </div>
              </div>
            </div>
            {/* eslint-disable-next-line react/no-unknown-property */}
            <style jsx>{`
              .fullscreenChatPanel {
                left: ${fullscreenChatPos?.x ?? 12}px;
                top: ${fullscreenChatPos?.y ?? 12}px;
                width: ${fullscreenChatSize?.w ?? 380}px;
                height: ${fullscreenChatSize?.h ?? 320}px;
              }
            `}</style>
          </>
        )}

        {/*
          Important: the player area is covered by iframes/videos which don't bubble
          drag/drop events. This overlay activates only while dragging, so dropping
          onto the main player reliably pins.
        */}
        <div
          className={`absolute inset-0 z-40 ${
            isDraggingTile ? "pointer-events-auto" : "pointer-events-none"
          }`}
          onDragOver={(e) => {
            if (!isDraggingTile) return;
            const types = Array.from(e.dataTransfer.types ?? []);
            const ok =
              types.includes(TILE_DND_MIME) || types.includes("text/plain");
            if (!ok) return;
            e.preventDefault();
            setIsStageDragOver(true);
            e.dataTransfer.dropEffect = "move";
          }}
          onDragEnter={() => {
            if (!isDraggingTile) return;
            setIsStageDragOver(true);
          }}
          onDragLeave={(e) => {
            if (!isDraggingTile) return;
            const next = e.relatedTarget as Node | null;
            if (next && e.currentTarget.contains(next)) return;
            setIsStageDragOver(false);
          }}
          onDrop={(e) => {
            if (!isDraggingTile) return;
            e.preventDefault();
            setIsStageDragOver(false);
            setIsDraggingTile(false);
            const raw =
              e.dataTransfer.getData(TILE_DND_MIME) ||
              e.dataTransfer.getData("text/plain");
            const payload = parseDraggedTilePayload(raw);
            if (!payload) return;
            setPinnedStage(payload);
          }}
        />

        {stageView && (
          <PinnedStageOverlay
            stageId={stageView.id}
            isLocal={stageView.isLocal}
            stream={stageView.stream}
            containerRef={screenStageContainerRef}
            onUnpin={onUnpinStage}
            onToggleFullscreen={toggleScreenFullscreen}
            isFullscreen={isScreenFullscreen}
          />
        )}

        <WebcamOverlay
          active={isPlayerFullscreen}
          localCamTrack={localCamTrack}
          containerRef={playerContainerRef}
          remotes={remotes}
          onCloseLocal={() => setCamEnabled(false)}
        />

        {isClient && (
          <div className="absolute inset-0">
            {isKick ? (
              <iframe
                key={kickEmbedSrc ?? normalizedUrl}
                src={kickEmbedSrc ?? undefined}
                title="Kick embed"
                className="absolute inset-0 w-full h-full"
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                referrerPolicy="origin"
                onLoad={onEmbedLoad}
              />
            ) : isTwitch ? (
              <iframe
                key={twitchEmbedSrc ?? normalizedUrl}
                src={twitchEmbedSrc ?? undefined}
                title="Twitch embed"
                className="absolute inset-0 w-full h-full"
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                referrerPolicy="origin"
                onLoad={onEmbedLoad}
              />
            ) : isPrime ? (
              <div className="absolute inset-0" />
            ) : isNetflix ? (
              <NetflixSyncPlayer
                url={normalizedUrl}
                isPlaying={videoState === "Playing"}
                currentTime={currentTime}
                volume={effectiveVolume}
                muted={effectiveMuted}
                playbackRate={playbackRate}
                onPlay={handlePlay}
                onPause={handlePause}
                onSeek={handleSeekTo}
                onProgress={(time, dur) => {
                  handleProgress(time);
                  if (dur > 0) handleDuration(dur);
                }}
                onReady={() => {
                  setPlayerReady(true);
                  setPlayerError(null);
                  clearLoadTimeout();
                }}
                onError={(err) => setPlayerError(err)}
                onDuration={handleDuration}
                className="absolute inset-0"
              />
            ) : isWebEmbed ? (
              <iframe
                key={normalizedUrl}
                src={canPlay ? normalizedUrl : undefined}
                title="Embedded site"
                className="absolute inset-0 w-full h-full"
                allow="autoplay; fullscreen; picture-in-picture; xr-spatial-tracking; encrypted-media; clipboard-write"
                allowFullScreen
                referrerPolicy="origin"
                onLoad={onEmbedLoad}
              />
            ) : isDirectFile ? (
              <video
                ref={playerRef as React.RefObject<HTMLVideoElement | null>}
                src={canPlay ? normalizedUrl : undefined}
                className="absolute inset-0 w-full h-full"
                controls
                playsInline
                preload="auto"
                muted={effectiveMuted}
                onPlay={(e) => {
                  if (applyingRemoteSyncRef.current) return;
                  if (!(e.nativeEvent as Event).isTrusted) return;
                  handlePlay();
                }}
                onPause={(e) => {
                  if (applyingRemoteSyncRef.current) return;
                  if (!(e.nativeEvent as Event).isTrusted) return;
                  handlePause();
                }}
                onSeeked={(e) => {
                  if (applyingRemoteSyncRef.current) return;

                  lastManualSeekRef.current = Date.now();

                  const currentTarget = (
                    e as { currentTarget?: unknown } | null
                  )?.currentTarget;
                  const time =
                    currentTarget &&
                    typeof (currentTarget as { currentTime?: unknown })
                      .currentTime === "number"
                      ? ((currentTarget as { currentTime: number })
                          .currentTime as number)
                      : null;

                  if (typeof time === "number" && !Number.isNaN(time)) {
                    handleSeekFromController(time);
                  }
                }}
                onVolumeChange={(e) => {
                  if (applyingRemoteSyncRef.current) return;

                  const currentTarget = (
                    e as { currentTarget?: unknown } | null
                  )?.currentTarget;
                  const volume =
                    currentTarget &&
                    typeof (currentTarget as { volume?: unknown }).volume ===
                      "number"
                      ? (currentTarget as { volume: number }).volume
                      : null;
                  const muted =
                    currentTarget &&
                    typeof (currentTarget as { muted?: unknown }).muted ===
                      "boolean"
                      ? (currentTarget as { muted: boolean }).muted
                      : null;

                  if (
                    typeof volume === "number" &&
                    !Number.isNaN(volume) &&
                    typeof muted === "boolean"
                  ) {
                    handleVolumeFromController(volume, muted);
                  }
                }}
                onRateChange={(e) => {
                  if (applyingRemoteSyncRef.current) return;

                  const currentTarget = (
                    e as { currentTarget?: unknown } | null
                  )?.currentTarget;
                  const rate =
                    currentTarget &&
                    typeof (currentTarget as { playbackRate?: unknown })
                      .playbackRate === "number"
                      ? (currentTarget as { playbackRate: number }).playbackRate
                      : null;

                  if (typeof rate === "number" && !Number.isNaN(rate)) {
                    handlePlaybackRateFromController(rate);
                  }
                }}
                onLoadedMetadata={(e) => {
                  setPlayerReady(true);
                  setPlayerError(null);
                  setIsBuffering(false);
                  const dur = (e.currentTarget as HTMLVideoElement).duration;
                  if (typeof dur === "number" && !isNaN(dur)) {
                    handleDuration(dur);
                  }
                  clearLoadTimeout();
                }}
                onCanPlay={() => {
                  setPlayerReady(true);
                  setPlayerError(null);
                  setIsBuffering(false);
                  clearLoadTimeout();
                }}
                onWaiting={() => setIsBuffering(true)}
                onPlaying={() => {
                  setPlayerReady(true);
                  setIsBuffering(false);
                  clearLoadTimeout();
                }}
                onTimeUpdate={(e) => {
                  const time = (e.currentTarget as HTMLVideoElement)
                    .currentTime;
                  if (typeof time === "number" && !isNaN(time)) {
                    handleProgress(time);
                  }
                }}
                onEnded={() => {
                  onVideoEnded?.();
                }}
                onError={handlePlayerError}
              />
            ) : isYouTube && useYouTubeIFrameApi ? (
              <YouTubeIFramePlayer
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ref={playerRef as any}
                className="absolute inset-0 w-full h-full"
                videoId={canPlay ? youTubeDesiredId : null}
                playing={canPlay && videoState === "Playing"}
                muted={effectiveMuted}
                volume={effectiveVolume}
                playbackRate={playbackRate}
                onReady={() => {
                  setPlayerReady(true);
                  setPlayerError(null);
                  setIsBuffering(false);
                  clearLoadTimeout();

                  ytLastProgressRef.current = null;

                  // If the room is already playing, align playhead ASAP.
                  resumeToRoomTimeIfNeeded();
                }}
                onError={(message) => {
                  setPlayerReady(false);
                  setIsBuffering(false);
                  setPlayerError(message);
                  clearLoadTimeout();
                }}
                onPlay={() => {
                  // The IFrame API's onReady fires once for the player, not
                  // for every subsequent video. Treat PLAYING as proof the
                  // current video loaded, otherwise our legacy per-URL load
                  // timeout can fire mid-play.
                  setPlayerReady(true);
                  setPlayerError(null);
                  setIsBuffering(false);
                  clearLoadTimeout();

                  if (applyingRemoteSyncRef.current) return;

                  handlePlay();
                }}
                onPause={() => {
                  if (applyingRemoteSyncRef.current) return;
                  // Don't broadcast pause when page is hidden - this is browser
                  // auto-pausing due to visibility policy, not user intent.
                  if (!isPageVisible) return;
                  if (videoState !== "Paused") handlePause();
                }}
                onEnded={() => {
                  onVideoEnded?.();
                }}
                onDuration={(dur) => {
                  // Duration becoming available is also a strong signal the
                  // current video is loaded.
                  setPlayerReady(true);
                  setPlayerError(null);
                  setIsBuffering(false);
                  clearLoadTimeout();

                  if (Number.isFinite(dur)) handleDuration(dur);
                }}
                onProgress={(time) => {
                  // First progress tick confirms playback is happening.
                  setPlayerReady(true);
                  setPlayerError(null);
                  setIsBuffering(false);
                  clearLoadTimeout();

                  if (!Number.isFinite(time)) return;

                  handleProgress(time);

                  // YouTube IFrame API doesn't reliably surface a native
                  // "seeked" event to React. Detect seeks by looking for
                  // large jumps in currentTime between progress ticks.
                  //
                  // Ignore programmatic seeks we apply when processing
                  // remote sync events.
                  if (applyingRemoteSyncRef.current) {
                    ytLastProgressRef.current = { t: time, at: Date.now() };
                    return;
                  }

                  const now = Date.now();
                  const prev = ytLastProgressRef.current;
                  ytLastProgressRef.current = { t: time, at: now };
                  if (!prev) return;

                  const dtMs = now - prev.at;
                  // If tab was backgrounded or ticks are delayed, don't infer seeks.
                  if (dtMs > 3000) return;

                  const delta = time - prev.t;
                  // Natural progression depends on playback rate and tick interval.
                  // At 500ms ticks: 1x=0.5s, 1.5x=0.75s, 2x=1s per tick.
                  // Add buffer for timing jitter. Use lower threshold when paused.
                  const isPlaying = videoState === "Playing";
                  const expectedDelta = isPlaying
                    ? (dtMs / 1000) * playbackRate
                    : 0;
                  // Threshold: expected delta + 0.6s buffer for seeks
                  const minJump = isPlaying ? expectedDelta + 0.6 : 0.25;

                  if (Math.abs(delta) >= minJump) {
                    console.log(
                      `[YT-SEEK] Detected seek: delta=${delta.toFixed(2)}s, expected=${expectedDelta.toFixed(2)}s, minJump=${minJump.toFixed(2)}s, time=${time.toFixed(2)}s`
                    );
                    lastManualSeekRef.current = Date.now();
                    handleSeekFromController(time, { force: true });
                  }
                }}
              />
            ) : (
              <ReactPlayer
                key={isYouTube ? `yt-${ytForceRemountNonce}` : undefined}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ref={playerRef as any}
                src={reactPlayerSrc}
                playing={videoState === "Playing" && youTubeIsOnDesired}
                muted={effectiveMuted}
                volume={effectiveVolume}
                playbackRate={playbackRate}
                width="100%"
                height="100%"
                controls={true}
                playsInline={true}
                config={playerConfig}
                onPlay={() => {
                  if (applyingRemoteSyncRef.current) return;
                  if (
                    isYouTube &&
                    !useYouTubeIFrameApi &&
                    !youTubeIsOnDesired
                  ) {
                    // User is trying to play, but our safety gate is holding
                    // playback until the desired id is confirmed. If the YT
                    // internal player isn't available yet, the user will see
                    // an immediate pause and be unable to seek/resume.
                    const now = Date.now();
                    if (now - ytLastUserRecoverAtRef.current > 1200) {
                      ytLastUserRecoverAtRef.current = now;

                      ytRequestedIdRef.current = null;
                      ytConfirmedIdRef.current = null;
                      setYtConfirmedId(null);
                      setPlayerReady(false);
                      setIsBuffering(true);
                      setYoutubeMountUrl(normalizedUrl);
                      setYtForceRemountNonce((n) => n + 1);

                      console.warn(
                        "[yt] user play requested while not on desired id; remounting",
                        {
                          targetId: youTubeDesiredId,
                          normalizedUrl,
                        }
                      );
                    }

                    handlePlay();
                    return;
                  }
                  handlePlay();
                }}
                onPause={() => {
                  if (applyingRemoteSyncRef.current) return;
                  // Don't broadcast pause when page is hidden - this is browser
                  // auto-pausing due to visibility policy, not user intent.
                  if (!isPageVisible) return;
                  if (isYouTube && !useYouTubeIFrameApi && !youTubeIsOnDesired)
                    return;
                  if (videoState !== "Paused") handlePause();
                }}
                onSeeked={() => {
                  if (applyingRemoteSyncRef.current) return;
                  lastManualSeekRef.current = Date.now();
                }}
                onSeek={(time: number) => {
                  if (applyingRemoteSyncRef.current) return;
                  if (typeof time !== "number" || Number.isNaN(time)) return;

                  lastManualSeekRef.current = Date.now();
                  handleSeekFromController(time, { force: true });
                }}
                onError={handlePlayerError}
                onReady={() => {
                  setPlayerReady(true);
                  setPlayerError(null);
                  setIsBuffering(false);
                  clearLoadTimeout();

                  if (isYouTube && !useYouTubeIFrameApi) {
                    // When we *mounted* the desired URL (i.e., visible remounts
                    // or user recovery remounts), ReactPlayer may fire onReady
                    // before the IFrame API can report getVideoData().
                    // Optimistically confirm the desired id so playback and
                    // seeking aren't blocked.
                    const desiredId = getYouTubeVideoId(normalizedUrl);
                    if (desiredId) {
                      ytRequestedIdRef.current = desiredId;
                      ytConfirmedIdRef.current = desiredId;
                      setYtConfirmedId(desiredId);
                    }
                  }

                  // If the room is already playing, align playhead ASAP.
                  resumeToRoomTimeIfNeeded();
                }}
                onStart={() => {
                  setPlayerReady(true);
                  setPlayerError(null);
                  setIsBuffering(false);
                  clearLoadTimeout();
                }}
                onPlaying={() => {
                  setPlayerReady(true);
                  setIsBuffering(false);
                  clearLoadTimeout();
                }}
                onProgress={
                  ((state: { playedSeconds: number }) => {
                    if (Number.isFinite(state.playedSeconds)) {
                      handleProgress(state.playedSeconds);
                    }
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  }) as any
                }
                onDurationChange={
                  ((dur: number) => {
                    if (Number.isFinite(dur)) handleDuration(dur);
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  }) as any
                }
                progressInterval={500}
                onEnded={() => {
                  onVideoEnded?.();
                }}
                style={{ position: "absolute", inset: 0 }}
              />
            )}
          </div>
        )}

        {(isKick || isTwitch || isPrime || isNetflix || isWebEmbed) && (
          <div className="absolute top-3 left-3 z-10">
            <span className="px-2.5 py-1 rounded-full text-[11px] font-medium border border-white/10 bg-black/40 text-slate-200">
              {isKick
                ? "Kick"
                : isTwitch
                  ? "Twitch"
                  : isPrime
                    ? "Prime Video"
                    : isNetflix
                      ? "Netflix Sync"
                      : "Web embed"}
            </span>
          </div>
        )}

        {isWebEmbed && !isNetflix && (
          <div className="absolute bottom-3 left-3 z-10 max-w-[75%] rounded-2xl border border-white/10 bg-black/50 backdrop-blur-md px-3 py-2">
            <div className="text-xs text-slate-200">
              This is an embedded website. Huddle can sync the link, but
              can&apos;t sync play/pause/seek for most sites.
            </div>
            <div className="mt-1">
              <a
                href={normalizedUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs underline underline-offset-4 text-slate-200"
              >
                Open site in new tab
              </a>
            </div>
          </div>
        )}

        {isPrime && (
          <div className="absolute inset-0 flex items-center justify-center text-center px-6 text-slate-200 bg-black/70">
            <div>
              <div className="font-semibold">
                Prime Video can���t be embedded
              </div>
              <div className="text-sm text-slate-300 mt-1">
                Prime Video is DRM-protected, so it won���t play inside Huddle.
                Open it in a new tab and we can still sync the link.
              </div>
              <div className="text-xs text-slate-400 mt-3 break-all">
                URL: {normalizedUrl}
              </div>
              <div className="mt-3">
                <a
                  href={normalizedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs underline underline-offset-4 text-slate-200"
                >
                  Open Prime Video in new tab
                </a>
              </div>
            </div>
          </div>
        )}

        {isBadYoutubeUrl && (
          <div className="absolute inset-0 flex items-center justify-center text-center px-6 text-slate-200 bg-black/70">
            <div>
              <div className="font-semibold">
                This YouTube link won���t embed
              </div>
              <div className="text-sm text-slate-300 mt-1">
                �ǣRadio / playlist��� links often load forever at 0:00.
              </div>
              <div className="text-sm text-slate-300 mt-3">
                Use a normal watch URL like:
                <div className="font-mono text-xs mt-1 break-all">
                  https://www.youtube.com/watch?v=jNQXAC9IVRw
                </div>
              </div>
            </div>
          </div>
        )}

        {canPlay && !playerReady && !playerError && !isNetflix && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-300 bg-black/40">
            {isBuffering ? "Buffering���" : "Loading video���"}
          </div>
        )}

        {isYouTube && ytAudioBlockedInBackground && !isPageVisible && (
          <div className="absolute bottom-3 right-3 z-10 max-w-[75%] rounded-2xl border border-white/10 bg-black/50 backdrop-blur-md px-3 py-2">
            <div className="text-xs text-slate-200">
              Audio may be blocked in background by your browser. Return to the
              tab (or click Play) to re-enable sound.
            </div>
          </div>
        )}

        {playerError && (
          <div className="absolute inset-0 flex items-center justify-center text-center px-6 text-slate-200 bg-black/70">
            <div>
              <div className="font-semibold">Player error</div>
              <div className="text-sm text-slate-300 mt-1 wrap-break-word">
                {playerError}
              </div>
              <div className="text-xs text-slate-400 mt-3 break-all">
                URL: {normalizedUrl}
              </div>
              <div className="mt-3">
                <a
                  href={normalizedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs underline underline-offset-4 text-slate-200"
                >
                  Open URL in new tab
                </a>
              </div>
            </div>
          </div>
        )}
      </div>

      <VideoControls
        url={normalizedUrl}
        isPlaying={videoState === "Playing"}
        currentTime={currentTime}
        duration={duration}
        volume={volume}
        muted={muted}
        effectiveVolume={effectiveVolume}
        effectiveMuted={effectiveMuted}
        playbackRate={playbackRate}
        isBuffering={isBuffering}
        onPlay={handlePlay}
        onPause={handlePause}
        onSeek={handleSeekTo}
        onVolumeChange={handleVolumeChange}
        onMuteToggle={toggleMute}
        audioSyncEnabled={audioSyncEnabled}
        onAudioSyncEnabledChange={onAudioSyncEnabledChange}
        onLocalVolumeChange={handleLocalVolumeChange}
        onLocalMuteToggle={toggleLocalMute}
        onPlaybackRateChange={handlePlaybackRateChange}
        onFullscreen={togglePlayerFullscreen}
        isFullscreen={isPlayerFullscreen}
        disabled={!isConnected || !canControlPlayback}
        disabledReason={
          isPrime
            ? "Prime Video can't be controlled inside Huddle"
            : isKick
              ? "Kick embeds can't be controlled programmatically"
              : isTwitch
                ? "Twitch embeds can't be controlled programmatically"
                : undefined
        }
      />
    </section>
  );
}
