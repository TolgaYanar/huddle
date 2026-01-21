import React from "react";

import { ensureYouTubeIframeApi } from "./api";
import type { YouTubeIFrameLatest } from "./internalTypes";
import type { YTPlayer } from "./types";
import { toVolume100, ytErrorMessage } from "./utils";

export function useYouTubePlayerInstance({
  resetNonce,
  wrapperRef,
  mountElRef,
  playerRef,
  lastStateRef,
  lastEnsurePlayAtRef,
  kickWindowUntilRef,
  kickAttemptsRef,
  lastVideoSwitchAtRef,
  latest,
}: {
  resetNonce: number;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  mountElRef: React.MutableRefObject<HTMLDivElement | null>;
  playerRef: React.MutableRefObject<YTPlayer | null>;
  lastStateRef: React.MutableRefObject<number | null>;
  lastEnsurePlayAtRef: React.MutableRefObject<number>;
  kickWindowUntilRef: React.MutableRefObject<number>;
  kickAttemptsRef: React.MutableRefObject<number>;
  lastVideoSwitchAtRef: React.MutableRefObject<number>;
  latest: React.MutableRefObject<YouTubeIFrameLatest>;
}) {
  // Create/destroy the YT player (rarely) and allow a hard reset if the
  // embedded player gets into a wedged state after many playlist switches.
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

            const maybeKickPlay = () => {
              if (!latest.current.playing) return;
              const now = Date.now();
              if (now > kickWindowUntilRef.current) return;
              if (kickAttemptsRef.current >= 10) return;
              if (now - lastEnsurePlayAtRef.current < 500) return;

              lastEnsurePlayAtRef.current = now;
              kickAttemptsRef.current += 1;
              try {
                player.playVideo();
              } catch {
                // ignore autoplay/user-gesture errors
              }
            };

            // If we're expecting playback, YouTube can briefly enter UNSTARTED (-1)
            // or CUED (5) after loadVideoById. Kick playVideo() within a bounded
            // window so we don't create infinite "loading" loops.
            if (nextState === -1 || nextState === 5) {
              maybeKickPlay();
            }

            if (nextState === 1 && prev !== 1) {
              latest.current.onPlay?.();
              return;
            }

            if (nextState === 2 && prev === 1) {
              const now = Date.now();

              // Ignore very recent switch-related pauses (common during next).
              if (now - lastVideoSwitchAtRef.current < 1500) return;

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
  }, [
    resetNonce,
    wrapperRef,
    mountElRef,
    playerRef,
    latest,
    lastStateRef,
    lastEnsurePlayAtRef,
    kickWindowUntilRef,
    kickAttemptsRef,
    lastVideoSwitchAtRef,
  ]);
}
