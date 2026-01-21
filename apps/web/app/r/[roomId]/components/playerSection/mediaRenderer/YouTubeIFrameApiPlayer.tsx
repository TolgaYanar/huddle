"use client";

import React from "react";

import YouTubeIFramePlayer from "../../YouTubeIFramePlayer";

export function YouTubeIFrameApiPlayer({
  playerRef,
  canPlay,
  youTubeDesiredId,
  youTubeStartTime,
  videoState,
  effectiveMuted,
  effectiveVolume,
  playbackRate,
  isPageVisible,
  applyingRemoteSyncRef,
  cancelPendingRoomCatchup,
  setPlayerReady,
  setPlayerError,
  setIsBuffering,
  clearLoadTimeout,
  syncToRoomTimeIfNeeded,
  handlePlay,
  handleUserPlay,
  handlePause,
  handleProgress,
  handleDuration,
  handleSeekFromController,
  lastManualSeekRef,
  onVideoEnded,
  normalizedUrl,
}: {
  playerRef: React.RefObject<unknown>;
  canPlay: boolean;
  youTubeDesiredId: string | null;
  youTubeStartTime: number | null;
  videoState: string;
  effectiveMuted: boolean;
  effectiveVolume: number;
  playbackRate: number;
  isPageVisible: boolean;
  applyingRemoteSyncRef: React.MutableRefObject<boolean>;
  cancelPendingRoomCatchup: () => void;
  setPlayerReady: React.Dispatch<React.SetStateAction<boolean>>;
  setPlayerError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsBuffering: React.Dispatch<React.SetStateAction<boolean>>;
  clearLoadTimeout: () => void;
  syncToRoomTimeIfNeeded: () => void;
  handlePlay: () => void;
  handleUserPlay: () => void;
  handlePause: () => void;
  handleProgress: (time: number) => void;
  handleDuration: (dur: number) => void;
  handleSeekFromController: (time: number, opts?: { force?: boolean }) => void;
  lastManualSeekRef: React.MutableRefObject<number>;
  onVideoEnded?: () => void;
  normalizedUrl: string;
}) {
  const ytLastProgressRef = React.useRef<{ t: number; at: number } | null>(
    null,
  );

  React.useEffect(() => {
    ytLastProgressRef.current = null;
  }, [normalizedUrl]);

  return (
    <YouTubeIFramePlayer
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={playerRef as any}
      className="absolute inset-0 w-full h-full"
      videoId={canPlay ? youTubeDesiredId : null}
      startTime={youTubeStartTime}
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
        syncToRoomTimeIfNeeded();
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

        const hasUserActivation =
          typeof navigator !== "undefined" &&
          (navigator as { userActivation?: { isActive?: boolean } })
            .userActivation?.isActive === true;

        // Allow explicit user play during remote-sync windows.
        if (applyingRemoteSyncRef.current && !hasUserActivation) return;
        if (hasUserActivation) {
          cancelPendingRoomCatchup();
        }

        if (hasUserActivation) {
          handleUserPlay();
        } else {
          handlePlay();
        }
      }}
      onPause={() => {
        // Don't broadcast pause when page is hidden - this is browser
        // auto-pausing due to visibility policy, not user intent.
        if (!isPageVisible) return;

        const hasUserActivation =
          typeof navigator !== "undefined" &&
          (navigator as { userActivation?: { isActive?: boolean } })
            .userActivation?.isActive === true;
        if (hasUserActivation) {
          cancelPendingRoomCatchup();
        }

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

          // If user is actively interacting (e.g., dragging the scrubber), we still
          // want to detect the seek and cancel any in-flight catchup.
          const hasUserActivation =
            typeof navigator !== "undefined" &&
            (navigator as { userActivation?: { isActive?: boolean } })
              .userActivation?.isActive === true;
          if (!hasUserActivation) return;
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
        const expectedDelta = isPlaying ? (dtMs / 1000) * playbackRate : 0;
        // Threshold: expected delta + 0.6s buffer for seeks
        const minJump = isPlaying ? expectedDelta + 0.6 : 0.25;

        if (Math.abs(delta) >= minJump) {
          console.log(
            `[YT-SEEK] Detected seek: delta=${delta.toFixed(2)}s, expected=${expectedDelta.toFixed(2)}s, minJump=${minJump.toFixed(2)}s, time=${time.toFixed(2)}s`,
          );
          lastManualSeekRef.current = Date.now();
          cancelPendingRoomCatchup();
          handleSeekFromController(time, { force: true });
        }
      }}
    />
  );
}
