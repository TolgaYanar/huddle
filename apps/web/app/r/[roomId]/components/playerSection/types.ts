import type * as React from "react";

import type { WebRTCMediaState } from "shared-logic";

import type { DraggedTilePayload } from "../../lib/dnd";

export type StageView = {
  id: string;
  isLocal: boolean;
  stream: MediaStream;
};

export type RemoteStream = {
  id: string;
  stream: MediaStream;
  media?: WebRTCMediaState;
};

export type FullscreenChatMessage = {
  msg: string;
  time: string;
  user: string;
};

export type PlayerSectionProps = {
  inputUrl: string;
  setInputUrl: React.Dispatch<React.SetStateAction<string>>;
  handleUrlChange: (e: React.FormEvent) => void;

  playerContainerRef: React.RefObject<HTMLDivElement | null>;
  togglePlayerFullscreen: () => void;
  isPlayerFullscreen: boolean;

  isDraggingTile: boolean;
  setIsDraggingTile: React.Dispatch<React.SetStateAction<boolean>>;
  isStageDragOver: boolean;
  setIsStageDragOver: React.Dispatch<React.SetStateAction<boolean>>;
  setPinnedStage: React.Dispatch<
    React.SetStateAction<DraggedTilePayload | null>
  >;

  stageView: StageView | null;
  screenStageContainerRef: React.RefObject<HTMLDivElement | null>;
  toggleScreenFullscreen: () => void;
  isScreenFullscreen: boolean;
  onUnpinStage: () => void;

  localCamTrack: MediaStreamTrack | null;
  remotes: RemoteStream[];

  setCamEnabled: (enabled: boolean) => void;

  isClient: boolean;
  isKick: boolean;
  isTwitch: boolean;
  isPrime: boolean;
  isNetflix: boolean;
  isWebEmbed: boolean;
  isBadYoutubeUrl: boolean;
  normalizedUrl: string;
  kickEmbedSrc: string | null;
  twitchEmbedSrc: string | null;

  canPlay: boolean;
  playerReady: boolean;
  setPlayerReady: React.Dispatch<React.SetStateAction<boolean>>;
  playerError: string | null;
  setPlayerError: React.Dispatch<React.SetStateAction<string | null>>;
  isBuffering: boolean;
  setIsBuffering: React.Dispatch<React.SetStateAction<boolean>>;

  loadTimeoutRef: React.MutableRefObject<number | null>;
  playerRef: React.RefObject<unknown>;
  handlePlayerError: (e: unknown) => void;
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
  lastUserPauseAtRef: React.MutableRefObject<number>;

  muted: boolean;
  volume: number;
  effectiveMuted: boolean;
  effectiveVolume: number;
  audioSyncEnabled: boolean;
  onAudioSyncEnabledChange: (enabled: boolean) => void;
  playbackRate: number;
  currentTime: number;
  duration: number;
  canControlPlayback: boolean;
  isConnected: boolean;
  videoState: string;
  handlePlay: () => void;
  handleUserPlay: () => void;
  handlePause: () => void;
  handleUserPause: () => void;
  suppressNextPlayBroadcast: (ms?: number) => void;
  suppressNextSeekBroadcast: (ms?: number) => void;
  handleSeekTo: (time: number, opts?: { force?: boolean }) => void;
  handleSeekFromController: (time: number, opts?: { force?: boolean }) => void;
  handleVolumeChange: (volume: number) => void;
  handleLocalVolumeChange: (volume: number) => void;
  handleVolumeFromController: (volume: number, muted: boolean) => void;
  handlePlaybackRateChange: (rate: number) => void;
  handlePlaybackRateFromController: (rate: number) => void;
  toggleMute: () => void;
  toggleLocalMute: () => void;
  handleProgress: (time: number) => void;
  handleDuration: (dur: number) => void;

  onVideoEnded?: () => void;

  fullscreenChatOpen: boolean;
  setFullscreenChatOpen: React.Dispatch<React.SetStateAction<boolean>>;
  fullscreenChatMessages: FullscreenChatMessage[];
  chatText: string;
  setChatText: React.Dispatch<React.SetStateAction<string>>;
  handleSendChat: (e: React.FormEvent) => void;
};
