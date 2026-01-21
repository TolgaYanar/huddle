import { useMemo } from "react";

import { normalizeVideoUrl } from "../../lib/video";

import type { UseVideoPlayerProps } from "./types";
import { useVideoPlayerState } from "./state";
import { useVolumeHandlers } from "./volumeHandlers";
import { useYouTubeControlPolling } from "./youtubePolling";
import { usePlaybackHandlers } from "./playbackHandlers";
import { useUrlHandlers } from "./urlHandlers";
import { useErrorHandler } from "./errorHandler";

export function useVideoPlayer({
  isClient,
  roomId,
  audioSyncEnabled,
  applyingRemoteSyncRef,
  lastManualSeekRef,
  hasInitialSyncRef,
  sendSyncEvent,
  addLogEntry,
}: UseVideoPlayerProps) {
  const state = useVideoPlayerState({ isClient, roomId, audioSyncEnabled });

  const {
    url,
    inputUrl,
    videoState,
    muted,
    volume,
    playbackRate,
    effectiveMuted,
    effectiveVolume,
    currentTime,
    duration,
    playerReady,
    playerError,
    isBuffering,
    videoPreview,
    showPreviewModal,
    isPreviewLoading,
    playerRef,
    loadTimeoutRef,
    setUrl,
    setInputUrl,
    setVideoState,
    setMuted,
    setVolume,
    setPlaybackRate,
    setCurrentTime,
    setDuration,
    setPlayerReady,
    setPlayerError,
    setIsBuffering,
  } = state;

  const {
    handleVolumeChange,
    handleLocalVolumeChange,
    handleVolumeFromController,
    toggleMute,
    toggleLocalMute,
    handlePlaybackRateChange,
    handlePlaybackRateFromController,
  } = useVolumeHandlers({
    state,
    sendSyncEvent,
    addLogEntry,
    audioSyncEnabled,
  });

  useYouTubeControlPolling({
    isClient,
    url,
    audioSyncEnabled,
    applyingRemoteSyncRef,
    state,
    handleVolumeChange,
    handleVolumeFromController,
    handlePlaybackRateFromController,
  });

  const {
    handlePlay,
    handlePause,
    handleSeek,
    handleSeekTo,
    handleSeekFromController,
    handleProgress,
    handleDuration,
    suppressNextPlayBroadcast,
    suppressNextSeekBroadcast,
  } = usePlaybackHandlers({
    state,
    url,
    duration,
    sendSyncEvent,
    addLogEntry,
    hasInitialSyncRef,
    applyingRemoteSyncRef,
    lastManualSeekRef,
  });

  const { handleUrlChange, loadVideoUrl, closePreviewModal } = useUrlHandlers({
    state,
    sendSyncEvent,
    addLogEntry,
  });

  const { handlePlayerError } = useErrorHandler({
    setPlayerError,
    addLogEntry,
  });

  const normalizedUrl = useMemo(() => normalizeVideoUrl(url), [url]);

  return {
    // State
    url,
    setUrl,
    inputUrl,
    setInputUrl,
    videoState,
    setVideoState,
    muted,
    setMuted,
    volume,
    setVolume,
    playbackRate,
    setPlaybackRate,
    effectiveMuted,
    effectiveVolume,
    currentTime,
    setCurrentTime,
    duration,
    setDuration,
    playerReady,
    setPlayerReady,
    playerError,
    setPlayerError,
    isBuffering,
    setIsBuffering,
    videoPreview,
    showPreviewModal,
    isPreviewLoading,

    // Refs
    playerRef,
    loadTimeoutRef,

    // Computed
    normalizedUrl,

    // Handlers
    handlePlay,
    handlePause,
    handleSeek,
    handleSeekTo,
    handleSeekFromController,
    handleVolumeChange,
    handleLocalVolumeChange,
    handleVolumeFromController,
    handlePlaybackRateChange,
    handlePlaybackRateFromController,
    handleProgress,
    handleDuration,
    toggleMute,
    toggleLocalMute,
    handleUrlChange,
    loadVideoUrl,
    handlePlayerError,
    closePreviewModal,

    // Used by player components when they call play() programmatically.
    suppressNextPlayBroadcast,

    // Used by player components when they seek() programmatically.
    suppressNextSeekBroadcast,
  };
}
