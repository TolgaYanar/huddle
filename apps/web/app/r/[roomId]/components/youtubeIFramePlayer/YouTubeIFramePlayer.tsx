"use client";

import React from "react";

import type { YouTubeIFrameLatest } from "./internalTypes";
import type {
  YTPlayer,
  YouTubeIFramePlayerHandle,
  YouTubeIFramePlayerProps,
} from "./types";
import { useYouTubeImperativeHandle } from "./useYouTubeImperativeHandle";
import { useYouTubePlayerInstance } from "./useYouTubePlayerInstance";
import { useYouTubeProgressPolling } from "./useYouTubeProgressPolling";
import { useYouTubePlayerSync } from "./useYouTubePlayerSync";

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
  }: YouTubeIFramePlayerProps,
  ref: React.ForwardedRef<YouTubeIFramePlayerHandle>,
) {
  const [resetNonce, setResetNonce] = React.useState(0);
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  const mountElRef = React.useRef<HTMLDivElement | null>(null);
  const playerRef = React.useRef<YTPlayer | null>(null);
  const lastStateRef = React.useRef<number | null>(null);
  const lastCommandedPlayingRef = React.useRef<boolean | null>(null);
  const lastCommandedVideoIdRef = React.useRef<string | null>(null);
  const lastRequestedVideoIdRef = React.useRef<string | null>(null);
  const lastVideoSwitchAtRef = React.useRef(0);
  const lastEnsurePlayAtRef = React.useRef(0);
  const kickWindowUntilRef = React.useRef(0);
  const kickAttemptsRef = React.useRef(0);
  const kickVideoIdRef = React.useRef<string | null>(null);
  const startTimeFallbackTriedForVideoRef = React.useRef<string | null>(null);
  const lastHardResetVideoIdRef = React.useRef<string | null>(null);
  // Track the start time that was used for the current video to avoid re-seeking
  const usedStartTimeForVideoRef = React.useRef<string | null>(null);
  const latest = React.useRef<YouTubeIFrameLatest>({
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

  useYouTubeImperativeHandle(ref, playerRef);

  useYouTubePlayerInstance({
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
  });

  useYouTubePlayerSync({
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
  });

  useYouTubeProgressPolling({
    playerRef,
    latest,
    enabled: Boolean(onProgress || onDuration),
  });

  return <div ref={wrapperRef} className={className} />;
}

export default React.forwardRef(YouTubeIFramePlayer);
