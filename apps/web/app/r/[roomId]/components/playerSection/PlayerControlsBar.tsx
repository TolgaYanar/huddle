"use client";

import React from "react";

import { VideoControls } from "../VideoControls";

export function PlayerControlsBar({
  url,
  isPlaying,
  currentTime,
  duration,
  volume,
  muted,
  effectiveVolume,
  effectiveMuted,
  playbackRate,
  isBuffering,
  onPlay,
  onPause,
  onSeek,
  onVolumeChange,
  onMuteToggle,
  audioSyncEnabled,
  onAudioSyncEnabledChange,
  onLocalVolumeChange,
  onLocalMuteToggle,
  onPlaybackRateChange,
  onFullscreen,
  isFullscreen,
  disabled,
  disabledReason,
}: {
  url: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  effectiveVolume: number;
  effectiveMuted: boolean;
  playbackRate: number;
  isBuffering: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  onMuteToggle: () => void;
  audioSyncEnabled: boolean;
  onAudioSyncEnabledChange: (enabled: boolean) => void;
  onLocalVolumeChange: (volume: number) => void;
  onLocalMuteToggle: () => void;
  onPlaybackRateChange: (rate: number) => void;
  onFullscreen: () => void;
  isFullscreen: boolean;
  disabled: boolean;
  disabledReason?: string;
}) {
  return (
    <VideoControls
      url={url}
      isPlaying={isPlaying}
      currentTime={currentTime}
      duration={duration}
      volume={volume}
      muted={muted}
      effectiveVolume={effectiveVolume}
      effectiveMuted={effectiveMuted}
      playbackRate={playbackRate}
      isBuffering={isBuffering}
      onPlay={onPlay}
      onPause={onPause}
      onSeek={onSeek}
      onVolumeChange={onVolumeChange}
      onMuteToggle={onMuteToggle}
      audioSyncEnabled={audioSyncEnabled}
      onAudioSyncEnabledChange={onAudioSyncEnabledChange}
      onLocalVolumeChange={onLocalVolumeChange}
      onLocalMuteToggle={onLocalMuteToggle}
      onPlaybackRateChange={onPlaybackRateChange}
      onFullscreen={onFullscreen}
      isFullscreen={isFullscreen}
      disabled={disabled}
      disabledReason={disabledReason}
    />
  );
}
