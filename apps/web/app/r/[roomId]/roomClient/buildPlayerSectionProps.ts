import type * as React from "react";

import type { useFullscreen } from "../hooks/useFullscreen";
import type { useMediaTracks } from "../hooks/useMediaTracks";
import type { useStagePinning } from "../hooks/useStagePinning";
import type { useVideoPlayer } from "../hooks/useVideoPlayer/useVideoPlayer";

import type { RoomClientViewProps } from "./RoomClientView";
import type { VideoEmbedInfo } from "./useVideoEmbedInfo";

type Video = ReturnType<typeof useVideoPlayer>;
type Fullscreen = ReturnType<typeof useFullscreen>;
type StagePinning = ReturnType<typeof useStagePinning>;
type MediaTracks = ReturnType<typeof useMediaTracks>;

export function buildPlayerSectionProps(args: {
  isClient: boolean;
  isConnected: boolean;

  video: Video;
  fullscreen: Fullscreen;
  stagePinning: StagePinning;
  mediaTracks: MediaTracks;
  videoEmbed: VideoEmbedInfo;

  remotesForPlayer: RoomClientViewProps["playerSectionProps"]["remotes"];

  applyingRemoteSyncRef: React.MutableRefObject<boolean>;
  roomPlaybackAnchorRef: React.MutableRefObject<{
    url: string;
    isPlaying: boolean;
    anchorTime: number;
    anchorAt: number;
    playbackRate: number;
  } | null>;
  roomPlaybackAnchorVersion: number;
  lastManualSeekRef: React.MutableRefObject<number>;

  audioSyncEnabled: boolean;
  onAudioSyncEnabledChange: (enabled: boolean) => void;

  fullscreenChatMessages: RoomClientViewProps["playerSectionProps"]["fullscreenChatMessages"];
  chatText: string;
  setChatText: React.Dispatch<React.SetStateAction<string>>;
  handleSendChat: (e: React.FormEvent) => void;

  onVideoEnded: () => void;
}): RoomClientViewProps["playerSectionProps"] {
  const {
    isClient,
    isConnected,
    video,
    fullscreen,
    stagePinning,
    mediaTracks,
    videoEmbed,
    remotesForPlayer,
    applyingRemoteSyncRef,
    roomPlaybackAnchorRef,
    roomPlaybackAnchorVersion,
    lastManualSeekRef,
    audioSyncEnabled,
    onAudioSyncEnabledChange,
    fullscreenChatMessages,
    chatText,
    setChatText,
    handleSendChat,
    onVideoEnded,
  } = args;

  return {
    inputUrl: video.inputUrl,
    setInputUrl: video.setInputUrl,
    handleUrlChange: video.handleUrlChange,

    playerContainerRef: fullscreen.playerContainerRef,
    togglePlayerFullscreen: fullscreen.togglePlayerFullscreen,
    isPlayerFullscreen: fullscreen.isPlayerFullscreen,

    isDraggingTile: stagePinning.isDraggingTile,
    setIsDraggingTile: stagePinning.setIsDraggingTile,
    isStageDragOver: stagePinning.isStageDragOver,
    setIsStageDragOver: stagePinning.setIsStageDragOver,
    setPinnedStage: stagePinning.setPinnedStage,

    stageView: stagePinning.stageViewForPlayer,
    screenStageContainerRef: fullscreen.screenStageContainerRef,
    toggleScreenFullscreen: fullscreen.toggleScreenFullscreen,
    isScreenFullscreen: fullscreen.isScreenFullscreen,
    onUnpinStage: stagePinning.onUnpinStage,

    localCamTrack: mediaTracks.camTrackRef.current,
    remotes: remotesForPlayer,

    setCamEnabled: mediaTracks.setCamEnabled,

    isClient,
    isKick: videoEmbed.isKick,
    isTwitch: videoEmbed.isTwitch,
    isPrime: videoEmbed.isPrime,
    isNetflix: videoEmbed.isNetflix,
    isWebEmbed: videoEmbed.isWebEmbed,
    isBadYoutubeUrl: videoEmbed.isBadYoutubeUrl,
    normalizedUrl: video.normalizedUrl,
    kickEmbedSrc: videoEmbed.kickEmbedSrc,
    twitchEmbedSrc: videoEmbed.twitchEmbedSrc,

    canPlay: videoEmbed.canPlay,
    playerReady: video.playerReady,
    setPlayerReady: video.setPlayerReady,
    playerError: video.playerError,
    setPlayerError: video.setPlayerError,
    isBuffering: video.isBuffering,
    setIsBuffering: video.setIsBuffering,

    loadTimeoutRef: video.loadTimeoutRef,
    playerRef: video.playerRef,
    handlePlayerError: video.handlePlayerError,
    applyingRemoteSyncRef,
    roomPlaybackAnchorRef,
    roomPlaybackAnchorVersion,
    lastManualSeekRef,
    lastUserPauseAtRef: video.lastUserPauseAtRef,

    muted: video.muted,
    volume: video.volume,
    effectiveMuted: video.effectiveMuted,
    effectiveVolume: video.effectiveVolume,
    audioSyncEnabled,
    onAudioSyncEnabledChange,
    playbackRate: video.playbackRate,
    currentTime: video.currentTime,
    duration: video.duration,
    canControlPlayback: videoEmbed.canControlPlayback,
    isConnected,
    videoState: video.videoState,

    handlePlay: video.handlePlay,
    handleUserPlay: video.handleUserPlay,
    handlePause: video.handlePause,
    handleUserPause: video.handleUserPause,
    suppressNextPlayBroadcast: video.suppressNextPlayBroadcast,
    suppressNextSeekBroadcast: video.suppressNextSeekBroadcast,
    handleSeekTo: video.handleSeekTo,
    handleSeekFromController: video.handleSeekFromController,
    handleVolumeChange: video.handleVolumeChange,
    handleLocalVolumeChange: video.handleLocalVolumeChange,
    handleVolumeFromController: video.handleVolumeFromController,
    handlePlaybackRateChange: video.handlePlaybackRateChange,
    handlePlaybackRateFromController: video.handlePlaybackRateFromController,
    toggleMute: video.toggleMute,
    toggleLocalMute: video.toggleLocalMute,
    handleProgress: video.handleProgress,
    handleDuration: video.handleDuration,

    onVideoEnded,

    fullscreenChatOpen: fullscreen.fullscreenChatOpen,
    setFullscreenChatOpen: fullscreen.setFullscreenChatOpen,
    fullscreenChatMessages,
    chatText,
    setChatText,
    handleSendChat,
  };
}
