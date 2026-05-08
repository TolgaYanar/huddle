"use client";

import React from "react";

import { NetflixSyncPlayer } from "../NetflixSyncPlayer";
import type { PlatformType } from "../videoControls/platform";
import { DailymotionEmbed } from "./mediaRenderer/DailymotionEmbed";
import { DirectFilePlayer } from "./mediaRenderer/DirectFilePlayer";
import { KickEmbed } from "./mediaRenderer/KickEmbed";
import { LoomEmbed } from "./mediaRenderer/LoomEmbed";
import { MediaOverlays } from "./mediaRenderer/Overlays";
import { PeerTubeEmbed } from "./mediaRenderer/PeerTubeEmbed";
import { ReactPlayerRenderer } from "./mediaRenderer/ReactPlayerRenderer";
import { SoundCloudEmbed } from "./mediaRenderer/SoundCloudEmbed";
import { Tier3CtaCard } from "./mediaRenderer/Tier3CtaCard";
import { TwitchEmbed } from "./mediaRenderer/TwitchEmbed";
import { WebEmbed } from "./mediaRenderer/WebEmbed";
import { YouTubeIFrameApiPlayer } from "./mediaRenderer/YouTubeIFrameApiPlayer";

export function PlayerMediaRenderer({
  isClient,
  platform,
  isKick,
  isTwitch,
  isPrime,
  isNetflix,
  isTier3,
  isDailymotion,
  dailymotionEmbedSrc,
  isSoundCloud,
  soundCloudEmbedSrc,
  isLoom,
  loomEmbedSrc,
  isPeerTube,
  peerTubeEmbedSrc,
  isWebEmbed,
  isDirectFile,
  isYouTube,
  isBadYoutubeUrl,
  useYouTubeIFrameApi,
  canPlay,
  normalizedUrl,
  kickEmbedSrc,
  twitchEmbedSrc,
  videoState,
  currentTime,
  effectiveVolume,
  effectiveMuted,
  playbackRate,
  isPageVisible,
  ytAudioBlockedInBackground,

  youTubeDesiredId,
  youTubeStartTime,
  youTubeIsOnDesired,
  ytForceRemountNonce,
  ytRequestedIdRef,
  ytConfirmedIdRef,
  ytLastUserRecoverAtRef,
  setYtConfirmedId,
  setPlayerReady,
  setPlayerError,
  setIsBuffering,
  setYoutubeMountUrl,
  setYtForceRemountNonce,

  playerRef,
  applyingRemoteSyncRef,
  lastManualSeekRef,

  playerConfig,
  reactPlayerSrc,

  onEmbedLoad,
  handlePlay,
  handleUserPlay,
  handlePause,
  handleUserSeek,
  handleProgress,
  handleDuration,
  handleSeekFromController,
  handleVolumeFromController,
  handlePlaybackRateFromController,
  handlePlayerError,
  cancelPendingRoomCatchup,
  clearLoadTimeout,
  syncToRoomTimeIfNeeded,
  onVideoEnded,

  playerReady,
  playerError,
  isBuffering,
}: {
  isClient: boolean;
  platform: PlatformType;
  isKick: boolean;
  isTwitch: boolean;
  isPrime: boolean;
  isNetflix: boolean;
  isTier3: boolean;
  isDailymotion: boolean;
  dailymotionEmbedSrc: string | null;
  isSoundCloud: boolean;
  soundCloudEmbedSrc: string | null;
  isLoom: boolean;
  loomEmbedSrc: string | null;
  isPeerTube: boolean;
  peerTubeEmbedSrc: string | null;
  isWebEmbed: boolean;
  isDirectFile: boolean;
  isYouTube: boolean;
  isBadYoutubeUrl: boolean;
  useYouTubeIFrameApi: boolean;
  canPlay: boolean;
  normalizedUrl: string;
  kickEmbedSrc: string | null;
  twitchEmbedSrc: string | null;
  videoState: string;
  currentTime: number;
  effectiveVolume: number;
  effectiveMuted: boolean;
  playbackRate: number;
  isPageVisible: boolean;
  ytAudioBlockedInBackground: boolean;

  youTubeDesiredId: string | null;
  youTubeStartTime: number | null;
  youTubeIsOnDesired: boolean;
  ytForceRemountNonce: number;
  ytRequestedIdRef: React.MutableRefObject<string | null>;
  ytConfirmedIdRef: React.MutableRefObject<string | null>;
  ytLastUserRecoverAtRef: React.MutableRefObject<number>;
  setYtConfirmedId: React.Dispatch<React.SetStateAction<string | null>>;
  setPlayerReady: React.Dispatch<React.SetStateAction<boolean>>;
  setPlayerError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsBuffering: React.Dispatch<React.SetStateAction<boolean>>;
  setYoutubeMountUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setYtForceRemountNonce: React.Dispatch<React.SetStateAction<number>>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  playerRef: React.RefObject<any>;
  applyingRemoteSyncRef: React.MutableRefObject<boolean>;
  lastManualSeekRef: React.MutableRefObject<number>;

  playerConfig: unknown;
  reactPlayerSrc: string | undefined;

  onEmbedLoad: () => void;
  handlePlay: () => void;
  handleUserPlay: () => void;
  handlePause: () => void;
  handleUserSeek: (time: number) => void;
  handleProgress: (time: number) => void;
  handleDuration: (dur: number) => void;
  handleSeekFromController: (time: number, opts?: { force?: boolean }) => void;
  handleVolumeFromController: (volume: number, muted: boolean) => void;
  handlePlaybackRateFromController: (rate: number) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handlePlayerError: (err: any) => void;
  cancelPendingRoomCatchup: () => void;
  clearLoadTimeout: () => void;
  syncToRoomTimeIfNeeded: () => void;
  onVideoEnded?: () => void;

  playerReady: boolean;
  playerError: string | null;
  isBuffering: boolean;
}) {
  if (!isClient) return null;

  // Tier-3 platforms (Disney+, HBO Max, Hulu, Apple TV+, Paramount+, Peacock)
  // can't be embedded inline at all — show the install-extension CTA card
  // instead of trying to render anything. Netflix has its own dedicated flow
  // below; Prime keeps its existing blank-frame behaviour.
  const showTier3Cta = isTier3 && !isNetflix && !isPrime;

  return (
    <>
      <div className="absolute inset-0">
        {showTier3Cta ? (
          <Tier3CtaCard platform={platform} url={normalizedUrl} />
        ) : isKick ? (
          <KickEmbed
            src={kickEmbedSrc}
            fallbackKey={normalizedUrl}
            onLoad={onEmbedLoad}
          />
        ) : isTwitch ? (
          <TwitchEmbed
            src={twitchEmbedSrc}
            fallbackKey={normalizedUrl}
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
            onSeek={handleUserSeek}
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
        ) : isDailymotion && dailymotionEmbedSrc ? (
          <DailymotionEmbed
            ref={
              playerRef as unknown as React.RefObject<
                import("./mediaRenderer/DailymotionEmbed").DailymotionEmbedRef | null
              >
            }
            src={dailymotionEmbedSrc}
            isPlaying={videoState === "Playing"}
            currentTime={currentTime}
            volume={effectiveVolume}
            muted={effectiveMuted}
            applyingRemoteSyncRef={applyingRemoteSyncRef}
            onPlay={handleUserPlay}
            onPause={handlePause}
            onSeek={handleUserSeek}
            onProgress={handleProgress}
            onDuration={handleDuration}
            onReady={() => {
              setPlayerReady(true);
              setPlayerError(null);
              setIsBuffering(false);
              clearLoadTimeout();
            }}
            onError={(err) => handlePlayerError(err)}
          />
        ) : isSoundCloud && soundCloudEmbedSrc ? (
          <SoundCloudEmbed
            ref={
              playerRef as unknown as React.RefObject<
                import("./mediaRenderer/SoundCloudEmbed").SoundCloudEmbedRef | null
              >
            }
            src={soundCloudEmbedSrc}
            isPlaying={videoState === "Playing"}
            currentTime={currentTime}
            volume={effectiveVolume}
            muted={effectiveMuted}
            applyingRemoteSyncRef={applyingRemoteSyncRef}
            onPlay={handleUserPlay}
            onPause={handlePause}
            onSeek={handleUserSeek}
            onProgress={handleProgress}
            onDuration={handleDuration}
            onReady={() => {
              setPlayerReady(true);
              setPlayerError(null);
              setIsBuffering(false);
              clearLoadTimeout();
            }}
            onError={(err) => handlePlayerError(err)}
          />
        ) : isLoom && loomEmbedSrc ? (
          <LoomEmbed
            src={loomEmbedSrc}
            fallbackKey={normalizedUrl}
            onLoad={onEmbedLoad}
          />
        ) : isPeerTube && peerTubeEmbedSrc ? (
          <PeerTubeEmbed
            src={peerTubeEmbedSrc}
            fallbackKey={normalizedUrl}
            onLoad={onEmbedLoad}
          />
        ) : isWebEmbed ? (
          <WebEmbed
            url={normalizedUrl}
            canPlay={canPlay}
            onLoad={onEmbedLoad}
          />
        ) : isDirectFile ? (
          <DirectFilePlayer
            playerRef={
              playerRef as unknown as React.RefObject<HTMLVideoElement | null>
            }
            url={normalizedUrl}
            canPlay={canPlay}
            effectiveMuted={effectiveMuted}
            applyingRemoteSyncRef={applyingRemoteSyncRef}
            lastManualSeekRef={lastManualSeekRef}
            cancelPendingRoomCatchup={cancelPendingRoomCatchup}
            handleUserPlay={handleUserPlay}
            handlePause={handlePause}
            handleSeekFromController={handleSeekFromController}
            handleVolumeFromController={handleVolumeFromController}
            handlePlaybackRateFromController={handlePlaybackRateFromController}
            setPlayerReady={setPlayerReady}
            setPlayerError={setPlayerError}
            setIsBuffering={setIsBuffering}
            clearLoadTimeout={clearLoadTimeout}
            handleDuration={handleDuration}
            handleProgress={handleProgress}
            onVideoEnded={onVideoEnded}
            handlePlayerError={handlePlayerError as (err: unknown) => void}
          />
        ) : isYouTube && useYouTubeIFrameApi ? (
          <YouTubeIFrameApiPlayer
            playerRef={playerRef as unknown as React.RefObject<unknown>}
            canPlay={canPlay}
            youTubeDesiredId={youTubeDesiredId}
            youTubeStartTime={youTubeStartTime}
            videoState={videoState}
            effectiveMuted={effectiveMuted}
            effectiveVolume={effectiveVolume}
            playbackRate={playbackRate}
            isPageVisible={isPageVisible}
            applyingRemoteSyncRef={applyingRemoteSyncRef}
            cancelPendingRoomCatchup={cancelPendingRoomCatchup}
            setPlayerReady={setPlayerReady}
            setPlayerError={setPlayerError}
            setIsBuffering={setIsBuffering}
            clearLoadTimeout={clearLoadTimeout}
            syncToRoomTimeIfNeeded={syncToRoomTimeIfNeeded}
            handlePlay={handlePlay}
            handleUserPlay={handleUserPlay}
            handlePause={handlePause}
            handleProgress={handleProgress}
            handleDuration={handleDuration}
            handleSeekFromController={handleSeekFromController}
            lastManualSeekRef={lastManualSeekRef}
            onVideoEnded={onVideoEnded}
            normalizedUrl={normalizedUrl}
          />
        ) : (
          <ReactPlayerRenderer
            playerRef={playerRef as unknown as React.RefObject<unknown>}
            reactPlayerSrc={reactPlayerSrc}
            normalizedUrl={normalizedUrl}
            isYouTube={isYouTube}
            useYouTubeIFrameApi={useYouTubeIFrameApi}
            youTubeIsOnDesired={youTubeIsOnDesired}
            ytForceRemountNonce={ytForceRemountNonce}
            ytRequestedIdRef={ytRequestedIdRef}
            ytConfirmedIdRef={ytConfirmedIdRef}
            ytLastUserRecoverAtRef={ytLastUserRecoverAtRef}
            youTubeDesiredId={youTubeDesiredId}
            videoState={videoState}
            effectiveMuted={effectiveMuted}
            effectiveVolume={effectiveVolume}
            playbackRate={playbackRate}
            isPageVisible={isPageVisible}
            applyingRemoteSyncRef={applyingRemoteSyncRef}
            setYtConfirmedId={setYtConfirmedId}
            setPlayerReady={setPlayerReady}
            setPlayerError={setPlayerError}
            setIsBuffering={setIsBuffering}
            setYoutubeMountUrl={setYoutubeMountUrl}
            setYtForceRemountNonce={setYtForceRemountNonce}
            clearLoadTimeout={clearLoadTimeout}
            syncToRoomTimeIfNeeded={syncToRoomTimeIfNeeded}
            cancelPendingRoomCatchup={cancelPendingRoomCatchup}
            handlePlay={handlePlay}
            handleUserPlay={handleUserPlay}
            handlePause={handlePause}
            handleSeekFromController={handleSeekFromController}
            lastManualSeekRef={lastManualSeekRef}
            handleProgress={handleProgress}
            handleDuration={handleDuration}
            onVideoEnded={onVideoEnded}
            handlePlayerError={handlePlayerError as (err: unknown) => void}
            playerConfig={playerConfig}
          />
        )}

        <MediaOverlays
          isKick={isKick}
          isTwitch={isTwitch}
          isPrime={isPrime}
          isNetflix={isNetflix}
          isWebEmbed={isWebEmbed}
          isBadYoutubeUrl={isBadYoutubeUrl}
          isYouTube={isYouTube}
          ytAudioBlockedInBackground={ytAudioBlockedInBackground}
          isPageVisible={isPageVisible}
          canPlay={canPlay}
          playerReady={playerReady}
          playerError={playerError}
          isBuffering={isBuffering}
          normalizedUrl={normalizedUrl}
        />
      </div>
    </>
  );
}
