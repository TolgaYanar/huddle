"use client";

import React from "react";

import { VideoControls } from "./VideoControls";
import { VideoSourceCard } from "./playerSection/VideoSourceCard";
import { PlayerViewport } from "./playerSection/PlayerViewport";
import { makePlayerMediaProps } from "./playerSection/makePlayerMediaProps";
import { useDirectFileElementSync } from "./playerSection/useDirectFileElementSync";
import { usePlayerConfig } from "./playerSection/usePlayerConfig";
import { useRoomCatchup } from "./playerSection/useRoomCatchup";
import { useYouTubePlayback } from "./playerSection/useYouTubePlayback";

import type { PlayerSectionProps } from "./playerSection/types";

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
  roomPlaybackAnchorVersion,
  lastManualSeekRef,
  lastUserPauseAtRef,

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
  handleUserPlay,
  handlePause,
  handleUserPause,
  suppressNextPlayBroadcast,
  suppressNextSeekBroadcast,
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
}: PlayerSectionProps) {
  const { playerConfig } = usePlayerConfig(normalizedUrl);

  const clearLoadTimeout = React.useCallback(() => {
    if (loadTimeoutRef.current) {
      window.clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
  }, [loadTimeoutRef]);

  const isDirectFile = React.useMemo(() => {
    return /\.(mp4|webm|ogv|ogg)(\?|#|$)/i.test(normalizedUrl);
  }, [normalizedUrl]);

  const {
    cancelPendingRoomCatchup,
    handlePlayWithRoomCatchup,
    handleUserSeek,
    syncToRoomTimeIfNeeded,
  } = useRoomCatchup({
    isClient,
    playerReady,
    normalizedUrl,
    duration,
    videoState,
    roomPlaybackAnchorVersion,
    playerRef,
    applyingRemoteSyncRef,
    roomPlaybackAnchorRef,
    lastManualSeekRef,
    lastUserPauseAtRef,
    suppressNextPlayBroadcast,
    suppressNextSeekBroadcast,
    handlePlay,
    handleSeekTo,
  });

  useDirectFileElementSync({
    isDirectFile,
    playerRef,
    effectiveMuted,
    effectiveVolume,
    playbackRate,
    videoState,
  });

  const onEmbedLoad = () => {
    setPlayerReady(true);
    setPlayerError(null);
    setIsBuffering(false);
    clearLoadTimeout();
  };

  const {
    isYouTube,
    isPageVisible,
    ytAudioBlockedInBackground,
    useYouTubeIFrameApi,
    reactPlayerSrc,
    youTubeDesiredId,
    youTubeStartTime,
    youTubeIsOnDesired,
    ytForceRemountNonce,
    setYtForceRemountNonce,
    ytRequestedIdRef,
    ytConfirmedIdRef,
    setYtConfirmedId,
    setYoutubeMountUrl,
    ytLastUserRecoverAtRef,
  } = useYouTubePlayback({
    isClient,
    normalizedUrl,
    canPlay,
    playerRef,
    effectiveMuted,
    effectiveVolume,
    videoState,
    suppressNextPlayBroadcast,
    setPlayerReady,
    setPlayerError,
    setIsBuffering,
    clearLoadTimeout,
    applyingRemoteSyncRef,
    onVideoEnded,
  });

  const mediaProps = makePlayerMediaProps({
    base: {
      isClient,
      isKick,
      isTwitch,
      isPrime,
      isNetflix,
      isWebEmbed,
      isDirectFile,
      isBadYoutubeUrl,
      canPlay,
      normalizedUrl,
      kickEmbedSrc,
      twitchEmbedSrc,
      videoState,
      currentTime,
      effectiveVolume,
      effectiveMuted,
      playbackRate,
      setPlayerReady,
      setPlayerError,
      setIsBuffering,
      playerRef,
      applyingRemoteSyncRef,
      lastManualSeekRef,
      playerConfig,
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
      clearLoadTimeout,
      onVideoEnded,
      playerReady,
      playerError,
      isBuffering,
    },
    youtube: {
      isYouTube,
      isPageVisible,
      ytAudioBlockedInBackground,
      useYouTubeIFrameApi,
      reactPlayerSrc,
      youTubeDesiredId,
      youTubeStartTime,
      youTubeIsOnDesired,
      ytForceRemountNonce,
      setYtForceRemountNonce,
      ytRequestedIdRef,
      ytConfirmedIdRef,
      setYtConfirmedId,
      setYoutubeMountUrl,
      ytLastUserRecoverAtRef,
    },
    roomCatchup: { cancelPendingRoomCatchup, syncToRoomTimeIfNeeded },
  });

  return (
    <section className="flex flex-col gap-6 lg:col-start-2 lg:row-start-1 lg:min-w-0">
      <VideoSourceCard
        inputUrl={inputUrl}
        setInputUrl={setInputUrl}
        handleUrlChange={handleUrlChange}
      />

      <PlayerViewport
        playerContainerRef={playerContainerRef}
        togglePlayerFullscreen={togglePlayerFullscreen}
        isPlayerFullscreen={isPlayerFullscreen}
        isDraggingTile={isDraggingTile}
        setIsDraggingTile={setIsDraggingTile}
        isStageDragOver={isStageDragOver}
        setIsStageDragOver={setIsStageDragOver}
        setPinnedStage={setPinnedStage}
        stageView={stageView}
        screenStageContainerRef={screenStageContainerRef}
        toggleScreenFullscreen={toggleScreenFullscreen}
        isScreenFullscreen={isScreenFullscreen}
        onUnpinStage={onUnpinStage}
        localCamTrack={localCamTrack}
        remotes={remotes}
        setCamEnabled={setCamEnabled}
        fullscreenChatOpen={fullscreenChatOpen}
        setFullscreenChatOpen={setFullscreenChatOpen}
        fullscreenChatMessages={fullscreenChatMessages}
        chatText={chatText}
        setChatText={setChatText}
        handleSendChat={handleSendChat}
        isConnected={isConnected}
        mediaProps={mediaProps}
      />

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
        onPlay={handlePlayWithRoomCatchup}
        onPause={handleUserPause}
        onSeek={handleUserSeek}
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
