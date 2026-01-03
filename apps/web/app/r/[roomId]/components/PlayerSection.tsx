"use client";

import React from "react";
import ReactPlayer from "react-player";

import { PinnedStageOverlay } from "./PinnedStageOverlay";
import { WebcamOverlay } from "./WebcamOverlay";
import { VideoControls } from "./VideoControls";
import {
  parseDraggedTilePayload,
  TILE_DND_MIME,
  type DraggedTilePayload,
} from "../lib/dnd";
import {
  getHtmlMediaElementFromRef,
  pauseFromRef,
  playFromRef,
} from "../lib/player";
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
  handleSeekFromController: (time: number) => void;
  handleVolumeChange: (volume: number) => void;
  handleLocalVolumeChange: (volume: number) => void;
  handleVolumeFromController: (volume: number, muted: boolean) => void;
  handlePlaybackRateChange: (rate: number) => void;
  handlePlaybackRateFromController: (rate: number) => void;
  toggleMute: () => void;
  toggleLocalMute: () => void;
  handleProgress: (time: number) => void;
  handleDuration: (dur: number) => void;

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
          controls: 1,
          fs: 0,
          rel: 0,
          enablejsapi: 1,
          ...(origin ? { origin } : {}),
        },
      },
    } as unknown as PlayerConfig;
  }, []);

  const clearLoadTimeout = () => {
    if (loadTimeoutRef.current) {
      window.clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
  };

  const isDirectFile = React.useMemo(() => {
    return /\.(mp4|webm|ogv|ogg)(\?|#|$)/i.test(normalizedUrl);
  }, [normalizedUrl]);

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

  return (
    <section className="flex flex-col gap-6 lg:col-start-2 lg:row-start-1 lg:min-w-0">
      <div className="backdrop-blur-md bg-white/5 rounded-2xl border border-white/10 p-4 sm:p-5">
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <div className="font-semibold text-slate-50">Video source</div>
              <div className="text-xs text-slate-400 mt-1">
                Paste a link (Kick/Twitch/YouTube) or a direct file URL
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
                Prime (link)
              </span>
            </div>
          </div>

          <form onSubmit={handleUrlChange} className="flex gap-2 w-full">
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="e.g. kick.com/elwind"
              className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/40 transition"
            />
            <button
              type="submit"
              className="h-11 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors text-sm font-medium text-slate-50"
            >
              Load
            </button>
          </form>
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
                referrerPolicy="origin"
                onLoad={onEmbedLoad}
              />
            ) : isPrime ? (
              <div className="absolute inset-0" />
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
                  if (!(e.nativeEvent as Event).isTrusted) return;
                  const el = e.currentTarget as HTMLVideoElement;
                  handleSeekFromController(el.currentTime);
                }}
                onVolumeChange={(e) => {
                  if (applyingRemoteSyncRef.current) return;
                  if (!(e.nativeEvent as Event).isTrusted) return;
                  const el = e.currentTarget as HTMLVideoElement;
                  handleVolumeFromController(el.volume, el.muted);
                }}
                onRateChange={(e) => {
                  if (applyingRemoteSyncRef.current) return;
                  if (!(e.nativeEvent as Event).isTrusted) return;
                  const el = e.currentTarget as HTMLVideoElement;
                  handlePlaybackRateFromController(el.playbackRate);
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
                onError={handlePlayerError}
              />
            ) : (
              <ReactPlayer
                ref={
                  playerRef as unknown as React.RefObject<HTMLVideoElement | null>
                }
                src={canPlay ? normalizedUrl : undefined}
                playing={videoState === "Playing"}
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
                  if (videoState !== "Playing") handlePlay();
                }}
                onPause={() => {
                  if (applyingRemoteSyncRef.current) return;
                  if (videoState !== "Paused") handlePause();
                }}
                onError={handlePlayerError}
                onReady={() => {
                  setPlayerReady(true);
                  setPlayerError(null);
                  setIsBuffering(false);
                  clearLoadTimeout();
                }}
                onStart={() => {
                  setPlayerReady(true);
                  setPlayerError(null);
                  setIsBuffering(false);
                  clearLoadTimeout();
                }}
                style={{ position: "absolute", inset: 0 }}
              />
            )}
          </div>
        )}

        {(isKick || isTwitch || isPrime) && (
          <div className="absolute top-3 left-3 z-10">
            <span className="px-2.5 py-1 rounded-full text-[11px] font-medium border border-white/10 bg-black/40 text-slate-200">
              {isKick ? "Kick" : isTwitch ? "Twitch" : "Prime Video"}
            </span>
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

        {canPlay && !playerReady && !playerError && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-300 bg-black/40">
            {isBuffering ? "Buffering���" : "Loading video���"}
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
