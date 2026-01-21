import React from "react";

import type { YouTubeIFrameLatest } from "./internalTypes";
import type { YTPlayer } from "./types";
import { toVolume100 } from "./utils";

export function useYouTubePlayerSync({
  videoId,
  startTime,
  playing,
  muted,
  volume,
  playbackRate,
  playerRef,
  latest,
  lastStateRef,
  lastCommandedPlayingRef,
  lastCommandedVideoIdRef,
  lastRequestedVideoIdRef,
  lastVideoSwitchAtRef,
  lastEnsurePlayAtRef,
  kickWindowUntilRef,
  kickAttemptsRef,
  kickVideoIdRef,
  startTimeFallbackTriedForVideoRef,
  lastHardResetVideoIdRef,
  usedStartTimeForVideoRef,
  setResetNonce,
}: {
  videoId: string | null;
  startTime?: number | null;
  playing: boolean;
  muted: boolean;
  volume: number;
  playbackRate: number;
  playerRef: React.MutableRefObject<YTPlayer | null>;
  latest: React.MutableRefObject<YouTubeIFrameLatest>;
  lastStateRef: React.MutableRefObject<number | null>;
  lastCommandedPlayingRef: React.MutableRefObject<boolean | null>;
  lastCommandedVideoIdRef: React.MutableRefObject<string | null>;
  lastRequestedVideoIdRef: React.MutableRefObject<string | null>;
  lastVideoSwitchAtRef: React.MutableRefObject<number>;
  lastEnsurePlayAtRef: React.MutableRefObject<number>;
  kickWindowUntilRef: React.MutableRefObject<number>;
  kickAttemptsRef: React.MutableRefObject<number>;
  kickVideoIdRef: React.MutableRefObject<string | null>;
  startTimeFallbackTriedForVideoRef: React.MutableRefObject<string | null>;
  lastHardResetVideoIdRef: React.MutableRefObject<string | null>;
  usedStartTimeForVideoRef: React.MutableRefObject<string | null>;
  setResetNonce: React.Dispatch<React.SetStateAction<number>>;
}) {
  // Keep props synced.
  React.useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    let startFallbackTimer: number | null = null;
    let hardResetTimer: number | null = null;
    let ensureStartSeekTimer: number | null = null;

    const maybeSeekToStartTime = () => {
      const desiredId = latest.current.videoId;
      const st = latest.current.startTime;
      if (!desiredId) return;
      if (!st || !(st > 0)) return;

      const key = `${desiredId}:${Math.floor(st)}`;
      if (usedStartTimeForVideoRef.current === key) return;

      // Only seek if we're still targeting this video.
      if (lastRequestedVideoIdRef.current !== desiredId) return;

      try {
        const cur = playerRef.current?.getCurrentTime?.();
        const curOk = typeof cur === "number" && Number.isFinite(cur) ? cur : 0;
        // If we're already near/after the desired start, don't fight the user.
        if (curOk >= st - 0.75) {
          usedStartTimeForVideoRef.current = key;
          return;
        }

        // Best-effort: seek, then ensure play if expected.
        playerRef.current?.seekTo?.(st, true);
        if (latest.current.playing) {
          try {
            playerRef.current?.playVideo?.();
          } catch {
            // ignore
          }
        }

        usedStartTimeForVideoRef.current = key;
      } catch {
        // ignore
      }
    };

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
      // IMPORTANT: Do not rely on getVideoData() here.
      // During playlist switches, the IFrame API often returns undefined or a
      // stale id for a short period. If we treat that as "not loaded yet",
      // we'll spam loadVideoById on every render and wedge the player.
      if (desired && desired !== lastRequestedVideoIdRef.current) {
        lastRequestedVideoIdRef.current = desired;
        lastVideoSwitchAtRef.current = Date.now();
        kickVideoIdRef.current = desired;
        kickAttemptsRef.current = 0;
        kickWindowUntilRef.current = Date.now() + 8000;
        lastStateRef.current = null;
        // Use the start time if this is the first load for this video
        const effectiveStartSeconds =
          startTime && startTime > 0 ? startTime : 0;
        // Mark that we've used the start time for this video
        usedStartTimeForVideoRef.current = effectiveStartSeconds
          ? `${desired}:${Math.floor(effectiveStartSeconds)}`
          : desired;
        if (playing) {
          player.loadVideoById({
            videoId: desired,
            startSeconds: effectiveStartSeconds,
          });

          // Some videos/embeds ignore startSeconds. Do a delayed seek once.
          if (effectiveStartSeconds > 0) {
            ensureStartSeekTimer = window.setTimeout(() => {
              try {
                // Only if we still want this same video.
                if (lastRequestedVideoIdRef.current !== desired) return;
                const cur = playerRef.current?.getCurrentTime?.();
                const curOk =
                  typeof cur === "number" && Number.isFinite(cur) ? cur : 0;
                if (curOk < effectiveStartSeconds - 0.75) {
                  maybeSeekToStartTime();
                }
              } catch {
                // ignore
              }
            }, 1200);
          }

          // Best-effort follow-up kick: even after loadVideoById, YouTube can
          // stay CUED/UNSTARTED. Keep this bounded to the kick window.
          window.setTimeout(() => {
            try {
              const now = Date.now();
              if (!latest.current.playing) return;
              if (kickVideoIdRef.current !== desired) return;
              if (now > kickWindowUntilRef.current) return;
              if (now - lastEnsurePlayAtRef.current < 500) return;
              lastEnsurePlayAtRef.current = now;
              kickAttemptsRef.current += 1;
              playerRef.current?.playVideo();
            } catch {
              // ignore
            }
          }, 250);

          // If a timestamped start appears to wedge the player (common on some
          // videos/embeds), retry once without startSeconds.
          if (effectiveStartSeconds > 0) {
            startTimeFallbackTriedForVideoRef.current = null;
            startFallbackTimer = window.setTimeout(() => {
              try {
                if (!latest.current.playing) return;
                if (kickVideoIdRef.current !== desired) return;
                if (startTimeFallbackTriedForVideoRef.current === desired)
                  return;

                const st =
                  playerRef.current?.getPlayerState?.() ?? lastStateRef.current;
                // 1 == playing
                if (st === 1) return;

                startTimeFallbackTriedForVideoRef.current = desired;
                // Extend recovery window a bit for the fallback attempt.
                kickWindowUntilRef.current = Date.now() + 6000;
                kickAttemptsRef.current = 0;

                playerRef.current?.loadVideoById({ videoId: desired });
                window.setTimeout(() => {
                  try {
                    playerRef.current?.playVideo();
                  } catch {
                    // ignore
                  }
                }, 250);
              } catch {
                // ignore
              }
            }, 4500);
          }

          // Last-resort: if the player never reaches PLAYING after a switch,
          // recreate the IFrame API player once per target video id.
          hardResetTimer = window.setTimeout(() => {
            try {
              if (!latest.current.playing) return;
              if (kickVideoIdRef.current !== desired) return;
              if (lastHardResetVideoIdRef.current === desired) return;

              const st =
                playerRef.current?.getPlayerState?.() ?? lastStateRef.current;
              if (st === 1) return;

              lastHardResetVideoIdRef.current = desired;
              setResetNonce((n) => n + 1);
            } catch {
              // ignore
            }
          }, 10000);
        } else {
          player.cueVideoById({
            videoId: desired,
            startSeconds: effectiveStartSeconds,
          });

          // If we're cueing with a start time, also seek after cue so the
          // play transition starts at the right offset.
          if (effectiveStartSeconds > 0) {
            ensureStartSeekTimer = window.setTimeout(() => {
              maybeSeekToStartTime();
            }, 800);
          }
        }
      }
    } catch {
      // ignore
    }

    // If the URL changes only in `t=` (same videoId), we still need to seek.
    // Do it after props update; this also helps when the player ignored
    // startSeconds.
    if (videoId && startTime && startTime > 0) {
      ensureStartSeekTimer = window.setTimeout(() => {
        maybeSeekToStartTime();
      }, 250);
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

    return () => {
      if (startFallbackTimer) window.clearTimeout(startFallbackTimer);
      if (hardResetTimer) window.clearTimeout(hardResetTimer);
      if (ensureStartSeekTimer) window.clearTimeout(ensureStartSeekTimer);
    };
  }, [
    videoId,
    startTime,
    playing,
    muted,
    volume,
    playbackRate,
    playerRef,
    latest,
    lastStateRef,
    lastCommandedPlayingRef,
    lastCommandedVideoIdRef,
    lastRequestedVideoIdRef,
    lastVideoSwitchAtRef,
    lastEnsurePlayAtRef,
    kickWindowUntilRef,
    kickAttemptsRef,
    kickVideoIdRef,
    startTimeFallbackTriedForVideoRef,
    lastHardResetVideoIdRef,
    usedStartTimeForVideoRef,
    setResetNonce,
  ]);
}
