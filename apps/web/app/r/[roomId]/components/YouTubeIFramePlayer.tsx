"use client";

import React from "react";

declare global {
  // Minimal YouTube IFrame API surface we rely on
  type YouTubeIframeApiNamespace = {
    Player: new (
      el: HTMLElement,
      opts: {
        width?: string | number;
        height?: string | number;
        videoId?: string;
        playerVars?: Record<string, unknown>;
        events?: {
          onReady?: () => void;
          onStateChange?: (ev: { data?: unknown }) => void;
          onError?: (ev: { data?: unknown }) => void;
        };
      }
    ) => YTPlayer;
  };

  interface Window {
    YT?: YouTubeIframeApiNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

type YTPlayer = {
  destroy: () => void;
  loadVideoById: (opts: { videoId: string; startSeconds?: number }) => void;
  cueVideoById: (opts: { videoId: string; startSeconds?: number }) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  setVolume: (vol: number) => void;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  setPlaybackRate: (rate: number) => void;
  getPlaybackRate: () => number;
  getVideoData?: () => { video_id?: string };
};

let ytApiPromise: Promise<void> | null = null;
function ensureYouTubeIframeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise<void>((resolve) => {
    const existing = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]'
    );
    if (existing) {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        try {
          prev?.();
        } catch {
          // ignore
        }
        resolve();
      };
      return;
    }

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;

    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      try {
        prev?.();
      } catch {
        // ignore
      }
      resolve();
    };

    document.head.appendChild(script);
  });

  return ytApiPromise;
}

export type YouTubeIFramePlayerHandle = {
  play: () => Promise<void>;
  pause: () => void;
  seekTo: (seconds: number, _type?: "seconds" | "fraction") => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getInternalPlayer: () => unknown;
};

function toVolume100(volume01: number) {
  return Math.max(0, Math.min(100, Math.round(volume01 * 100)));
}

function ytErrorMessage(code: unknown): string {
  // https://developers.google.com/youtube/iframe_api_reference#onError
  if (code === 2) return "YouTube error: invalid video parameters.";
  if (code === 5) return "YouTube error: HTML5 player error.";
  if (code === 100) return "YouTube error: video not found or removed.";
  if (code === 101 || code === 150)
    return "YouTube error: embedding is disabled for this video.";
  return "YouTube error: failed to load video.";
}

export function YouTubeIFramePlayer(
  {
    videoId,
    startTime,
    playing,
    muted,
    volume,
    playbackRate,
    onReady,
    onError,
    onEnded,
    onPlay,
    onPause,
    onDuration,
    onProgress,
    className,
  }: {
    videoId: string | null;
    startTime?: number | null;
    playing: boolean;
    muted: boolean;
    volume: number;
    playbackRate: number;
    onReady?: () => void;
    onError?: (message: string) => void;
    onEnded?: () => void;
    onPlay?: () => void;
    onPause?: () => void;
    onDuration?: (dur: number) => void;
    onProgress?: (time: number) => void;
    className?: string;
  },
  ref: React.ForwardedRef<YouTubeIFramePlayerHandle>
) {
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  const mountElRef = React.useRef<HTMLDivElement | null>(null);
  const playerRef = React.useRef<YTPlayer | null>(null);
  const lastStateRef = React.useRef<number | null>(null);
  const lastCommandedPlayingRef = React.useRef<boolean | null>(null);
  const lastCommandedVideoIdRef = React.useRef<string | null>(null);
  // Track the start time that was used for the current video to avoid re-seeking
  const usedStartTimeForVideoRef = React.useRef<string | null>(null);
  const latest = React.useRef({
    videoId,
    startTime,
    playing,
    muted,
    volume,
    playbackRate,
    onReady,
    onError,
    onEnded,
    onPlay,
    onPause,
    onDuration,
    onProgress,
  });

  React.useEffect(() => {
    latest.current = {
      videoId,
      startTime,
      playing,
      muted,
      volume,
      playbackRate,
      onReady,
      onError,
      onEnded,
      onPlay,
      onPause,
      onDuration,
      onProgress,
    };
  }, [
    videoId,
    startTime,
    playing,
    muted,
    volume,
    playbackRate,
    onReady,
    onError,
    onEnded,
    onPlay,
    onPause,
    onDuration,
    onProgress,
  ]);

  React.useImperativeHandle(
    ref,
    () => ({
      play: async () => {
        try {
          playerRef.current?.playVideo();
        } catch {
          // ignore autoplay/user-gesture errors
        }
      },
      pause: () => {
        try {
          playerRef.current?.pauseVideo();
        } catch {
          // ignore
        }
      },
      seekTo: (seconds: number) => {
        const player = playerRef.current;
        if (!player || typeof player.seekTo !== "function") {
          console.log(`[YT-IFRAME] seekTo skipped - player not ready`);
          return;
        }
        try {
          player.seekTo(seconds, true);
        } catch (err) {
          console.error(`[YT-IFRAME] seekTo error:`, err);
        }
      },
      getCurrentTime: () => {
        try {
          const t = playerRef.current?.getCurrentTime?.();
          return typeof t === "number" && Number.isFinite(t) ? t : 0;
        } catch {
          return 0;
        }
      },
      getDuration: () => {
        try {
          const d = playerRef.current?.getDuration?.();
          return typeof d === "number" && Number.isFinite(d) ? d : 0;
        } catch {
          return 0;
        }
      },
      getInternalPlayer: () => playerRef.current,
    }),
    []
  );

  // Create/destroy the YT player once.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    let cancelled = false;

    const init = async () => {
      await ensureYouTubeIframeApi();
      if (cancelled) return;
      if (!window.YT || !window.YT.Player) return;

      // IMPORTANT: The YouTube IFrame API replaces the element you pass it.
      // If React owns that element, unmounting later can crash with:
      // "Failed to execute 'removeChild' on 'Node'...".
      // So we create a mount element imperatively that React does not track.
      try {
        wrapper.replaceChildren();
      } catch {
        // ignore
      }

      const mount = document.createElement("div");
      mount.style.width = "100%";
      mount.style.height = "100%";
      wrapper.appendChild(mount);
      mountElRef.current = mount;

      const origin = window.location.origin;

      // Get the initial start time for the video
      const initialStartTime = latest.current.startTime;

      const player = new window.YT.Player(mount, {
        width: "100%",
        height: "100%",
        videoId: latest.current.videoId ?? undefined,
        playerVars: {
          autoplay: 0,
          controls: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          enablejsapi: 1,
          origin,
          // Start at the specified time if provided
          ...(initialStartTime && initialStartTime > 0
            ? { start: initialStartTime }
            : {}),
        },
        events: {
          onReady: () => {
            if (cancelled) return;
            lastStateRef.current = null;
            try {
              // Apply initial audio state
              if (latest.current.muted) {
                player.mute();
              } else {
                player.unMute();
                player.setVolume(toVolume100(latest.current.volume));
              }
              player.setPlaybackRate(latest.current.playbackRate);
            } catch {
              // ignore
            }

            // Duration becomes available slightly later; sample once.
            try {
              const d = player.getDuration();
              if (typeof d === "number" && Number.isFinite(d) && d > 0) {
                latest.current.onDuration?.(d);
              }
            } catch {
              // ignore
            }

            latest.current.onReady?.();
            if (latest.current.playing) {
              try {
                player.playVideo();
              } catch {
                // ignore
              }
            }
          },
          onStateChange: (ev: { data?: unknown }) => {
            // YouTube player states:
            // -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
            const raw = ev?.data;
            const nextState =
              typeof raw === "number" && Number.isFinite(raw) ? raw : null;
            if (nextState === null) return;

            const prev = lastStateRef.current;
            lastStateRef.current = nextState;

            // Only treat PAUSED as a real pause if we were previously PLAYING.
            // This avoids spurious pause emissions during initial load,
            // autoplay blocking, cueing, or buffering transitions.
            if (nextState === 0) {
              latest.current.onEnded?.();
              return;
            }

            if (nextState === 1 && prev !== 1) {
              latest.current.onPlay?.();
              return;
            }

            if (nextState === 2 && prev === 1) {
              latest.current.onPause?.();
            }
          },
          onError: (ev: { data?: unknown }) => {
            latest.current.onError?.(ytErrorMessage(ev?.data));
          },
        },
      }) as YTPlayer;

      playerRef.current = player;
    };

    void init();

    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy();
      } catch {
        // ignore
      }
      playerRef.current = null;

      // Clean up any leftover iframe nodes.
      try {
        wrapper.replaceChildren();
      } catch {
        // ignore
      }
      mountElRef.current = null;
    };
  }, []);

  // Keep props synced.
  React.useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    // Audio
    try {
      if (muted) {
        player.mute();
      } else {
        player.unMute();
        player.setVolume(toVolume100(volume));
      }
    } catch {
      // ignore
    }

    // Rate
    try {
      player.setPlaybackRate(playbackRate);
    } catch {
      // ignore
    }

    // Video switching
    try {
      const desired = videoId;
      const current = player.getVideoData?.()?.video_id;
      if (desired && desired !== current) {
        lastStateRef.current = null;
        // Use the start time if this is the first load for this video
        const effectiveStartSeconds =
          startTime && startTime > 0 ? startTime : 0;
        // Mark that we've used the start time for this video
        usedStartTimeForVideoRef.current = desired;
        if (playing) {
          player.loadVideoById({
            videoId: desired,
            startSeconds: effectiveStartSeconds,
          });
        } else {
          player.cueVideoById({
            videoId: desired,
            startSeconds: effectiveStartSeconds,
          });
        }
      }
    } catch {
      // ignore
    }

    // Play/pause
    try {
      const lastCmdPlaying = lastCommandedPlayingRef.current;
      const lastCmdVideoId = lastCommandedVideoIdRef.current;

      // Avoid spamming commands on every render; only issue when the
      // desired state actually changes (or when the video id changes).
      const videoChanged = videoId !== lastCmdVideoId;
      const playingChanged = playing !== lastCmdPlaying;

      if (videoChanged) lastCommandedVideoIdRef.current = videoId;

      if (playingChanged || videoChanged) {
        lastCommandedPlayingRef.current = playing;
        if (playing) {
          player.playVideo();
        } else {
          player.pauseVideo();
        }
      }
    } catch {
      // ignore
    }
  }, [videoId, startTime, playing, muted, volume, playbackRate]);

  // Progress polling
  React.useEffect(() => {
    if (!onProgress && !onDuration) return;

    let t: number | null = null;
    const tick = () => {
      const player = playerRef.current;
      if (!player) return;
      try {
        const time = player.getCurrentTime();
        if (typeof time === "number" && Number.isFinite(time)) {
          latest.current.onProgress?.(time);
        }
        const dur = player.getDuration();
        if (typeof dur === "number" && Number.isFinite(dur) && dur > 0) {
          latest.current.onDuration?.(dur);
        }
      } catch {
        // ignore
      }
    };

    t = window.setInterval(tick, 500);
    return () => {
      if (t) window.clearInterval(t);
    };
  }, [onProgress, onDuration]);

  return <div ref={wrapperRef} className={className} />;
}

export default React.forwardRef(YouTubeIFramePlayer);
