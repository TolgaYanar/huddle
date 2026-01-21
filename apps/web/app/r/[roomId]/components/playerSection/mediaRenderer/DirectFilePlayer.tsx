"use client";

import React from "react";

export function DirectFilePlayer({
  playerRef,
  url,
  canPlay,
  effectiveMuted,
  applyingRemoteSyncRef,
  lastManualSeekRef,
  cancelPendingRoomCatchup,
  handlePlay,
  handlePause,
  handleSeekFromController,
  handleVolumeFromController,
  handlePlaybackRateFromController,
  setPlayerReady,
  setPlayerError,
  setIsBuffering,
  clearLoadTimeout,
  handleDuration,
  handleProgress,
  onVideoEnded,
  handlePlayerError,
}: {
  playerRef: React.RefObject<HTMLVideoElement | null>;
  url: string;
  canPlay: boolean;
  effectiveMuted: boolean;
  applyingRemoteSyncRef: React.MutableRefObject<boolean>;
  lastManualSeekRef: React.MutableRefObject<number>;
  cancelPendingRoomCatchup: () => void;
  handlePlay: () => void;
  handlePause: () => void;
  handleSeekFromController: (time: number, opts?: { force?: boolean }) => void;
  handleVolumeFromController: (volume: number, muted: boolean) => void;
  handlePlaybackRateFromController: (rate: number) => void;
  setPlayerReady: React.Dispatch<React.SetStateAction<boolean>>;
  setPlayerError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsBuffering: React.Dispatch<React.SetStateAction<boolean>>;
  clearLoadTimeout: () => void;
  handleDuration: (dur: number) => void;
  handleProgress: (time: number) => void;
  onVideoEnded?: () => void;
  handlePlayerError: (err: unknown) => void;
}) {
  return (
    <video
      ref={playerRef}
      src={canPlay ? url : undefined}
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
        cancelPendingRoomCatchup();

        const currentTarget = (e as { currentTarget?: unknown } | null)
          ?.currentTarget;
        const time =
          currentTarget &&
          typeof (currentTarget as { currentTime?: unknown }).currentTime ===
            "number"
            ? ((currentTarget as { currentTime: number }).currentTime as number)
            : null;

        if (typeof time === "number" && !Number.isNaN(time)) {
          handleSeekFromController(time, { force: true });
        }
      }}
      onVolumeChange={(e) => {
        if (applyingRemoteSyncRef.current) return;

        const currentTarget = (e as { currentTarget?: unknown } | null)
          ?.currentTarget;
        const volume =
          currentTarget &&
          typeof (currentTarget as { volume?: unknown }).volume === "number"
            ? (currentTarget as { volume: number }).volume
            : null;
        const muted =
          currentTarget &&
          typeof (currentTarget as { muted?: unknown }).muted === "boolean"
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

        const currentTarget = (e as { currentTarget?: unknown } | null)
          ?.currentTarget;
        const rate =
          currentTarget &&
          typeof (currentTarget as { playbackRate?: unknown }).playbackRate ===
            "number"
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
        const time = (e.currentTarget as HTMLVideoElement).currentTime;
        if (typeof time === "number" && !isNaN(time)) {
          handleProgress(time);
        }
      }}
      onEnded={() => {
        onVideoEnded?.();
      }}
      onError={handlePlayerError as React.ReactEventHandler<HTMLVideoElement>}
    />
  );
}
