"use client";

import React from "react";
import ReactPlayerBase from "react-player";

import { getYouTubeVideoId } from "../../../lib/video";

// Cast ReactPlayer to any to work around broken TypeScript definitions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ReactPlayer = ReactPlayerBase as any;

export function ReactPlayerRenderer({
  playerRef,
  reactPlayerSrc,
  normalizedUrl,
  isYouTube,
  useYouTubeIFrameApi,
  youTubeIsOnDesired,
  ytForceRemountNonce,
  ytRequestedIdRef,
  ytConfirmedIdRef,
  ytLastUserRecoverAtRef,
  youTubeDesiredId,
  videoState,
  effectiveMuted,
  effectiveVolume,
  playbackRate,
  isPageVisible,
  applyingRemoteSyncRef,
  setYtConfirmedId,
  setPlayerReady,
  setPlayerError,
  setIsBuffering,
  setYoutubeMountUrl,
  setYtForceRemountNonce,
  clearLoadTimeout,
  syncToRoomTimeIfNeeded,
  handlePlay,
  handlePause,
  handleSeekFromController,
  lastManualSeekRef,
  handleProgress,
  handleDuration,
  onVideoEnded,
  handlePlayerError,
  playerConfig,
}: {
  playerRef: React.RefObject<unknown>;
  reactPlayerSrc: string | undefined;
  normalizedUrl: string;
  isYouTube: boolean;
  useYouTubeIFrameApi: boolean;
  youTubeIsOnDesired: boolean;
  ytForceRemountNonce: number;
  ytRequestedIdRef: React.MutableRefObject<string | null>;
  ytConfirmedIdRef: React.MutableRefObject<string | null>;
  ytLastUserRecoverAtRef: React.MutableRefObject<number>;
  youTubeDesiredId: string | null;
  videoState: string;
  effectiveMuted: boolean;
  effectiveVolume: number;
  playbackRate: number;
  isPageVisible: boolean;
  applyingRemoteSyncRef: React.MutableRefObject<boolean>;
  setYtConfirmedId: React.Dispatch<React.SetStateAction<string | null>>;
  setPlayerReady: React.Dispatch<React.SetStateAction<boolean>>;
  setPlayerError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsBuffering: React.Dispatch<React.SetStateAction<boolean>>;
  setYoutubeMountUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setYtForceRemountNonce: React.Dispatch<React.SetStateAction<number>>;
  clearLoadTimeout: () => void;
  syncToRoomTimeIfNeeded: () => void;
  handlePlay: () => void;
  handlePause: () => void;
  handleSeekFromController: (time: number, opts?: { force?: boolean }) => void;
  lastManualSeekRef: React.MutableRefObject<number>;
  handleProgress: (time: number) => void;
  handleDuration: (dur: number) => void;
  onVideoEnded?: () => void;
  handlePlayerError: (err: unknown) => void;
  playerConfig: unknown;
}) {
  return (
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
        if (isYouTube && !useYouTubeIFrameApi && !youTubeIsOnDesired) {
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
              },
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
        if (isYouTube && !useYouTubeIFrameApi && !youTubeIsOnDesired) return;
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
        syncToRoomTimeIfNeeded();
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
  );
}
