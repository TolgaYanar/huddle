"use client";

import React from "react";

import {
  ExitFullscreenIcon,
  FullscreenIcon,
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
  VolumeHighIcon,
  VolumeLowIcon,
  VolumeMuteIcon,
} from "./icons";
import { PlaybackSpeedMenu } from "./PlaybackSpeedMenu";
import { detectPlatform, PLATFORM_CAPABILITIES } from "./platform";
import { ProgressBar } from "./ProgressBar";
import { SettingsMenu } from "./SettingsMenu";
import type { VideoControlsProps } from "./types";
import { VolumeControl } from "./VolumeControl";

export function VideoControls({
  url,
  isPlaying,
  muted,
  volume,
  effectiveMuted,
  effectiveVolume,
  currentTime,
  duration,
  playbackRate,
  isBuffering,
  onPlay,
  onPause,
  onSeek,
  onMuteToggle,
  onVolumeChange,
  onLocalMuteToggle,
  onLocalVolumeChange,
  audioSyncEnabled,
  onAudioSyncEnabledChange,
  onPlaybackRateChange,
  onFullscreen,
  isFullscreen = false,
  disabled = false,
  disabledReason,
  className = "",
  minimal = false,
}: VideoControlsProps) {
  const platform = detectPlatform(url);
  const capabilities = PLATFORM_CAPABILITIES[platform];

  const roomAudioSyncEnabled = audioSyncEnabled ?? true;

  const usingLocalAudio =
    !roomAudioSyncEnabled &&
    typeof onLocalVolumeChange === "function" &&
    typeof onLocalMuteToggle === "function";

  const displayMuted = usingLocalAudio ? (effectiveMuted ?? muted) : muted;
  const displayVolume = usingLocalAudio ? (effectiveVolume ?? volume) : volume;

  const VolumeIcon =
    displayMuted || displayVolume === 0
      ? VolumeMuteIcon
      : displayVolume < 0.5
        ? VolumeLowIcon
        : VolumeHighIcon;

  const canControl = !disabled && capabilities.canPlay;
  const effectiveDisabledReason =
    disabled && disabledReason
      ? disabledReason
      : !capabilities.canPlay
        ? `${platform === "kick" ? "Kick" : platform === "twitch" ? "Twitch" : "This platform"} doesn't support programmatic control`
        : undefined;

  if (minimal) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <button
          onClick={isPlaying ? onPause : onPlay}
          disabled={!canControl}
          className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title={effectiveDisabledReason}
        >
          {isBuffering ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : isPlaying ? (
            <PauseIcon />
          ) : (
            <PlayIcon />
          )}
        </button>
      </div>
    );
  }

  return (
    <div
      className={`backdrop-blur-md bg-black/60 rounded-2xl border border-white/10 p-4 ${className}`}
    >
      {/* Progress Bar */}
      {capabilities.canGetDuration && capabilities.canSeek && (
        <ProgressBar
          disabled={Boolean(disabled)}
          canSeek={capabilities.canSeek}
          currentTime={currentTime}
          duration={duration}
          onSeek={onSeek}
        />
      )}

      {/* Main Controls */}
      <div className="flex items-center justify-between gap-4">
        {/* Left: Play controls */}
        <div className="flex items-center gap-2">
          {/* Skip Back */}
          <button
            onClick={() => onSeek(Math.max(0, currentTime - 10))}
            disabled={!canControl || !capabilities.canSeek}
            className="h-9 w-9 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Back 10s"
          >
            <SkipBackIcon />
          </button>

          {/* Play/Pause */}
          <button
            onClick={isPlaying ? onPause : onPlay}
            disabled={!canControl}
            className="h-11 w-11 rounded-xl bg-white text-slate-900 hover:bg-slate-100 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg"
            title={effectiveDisabledReason || (isPlaying ? "Pause" : "Play")}
          >
            {isBuffering ? (
              <div className="w-5 h-5 border-2 border-slate-400 border-t-slate-900 rounded-full animate-spin" />
            ) : isPlaying ? (
              <PauseIcon />
            ) : (
              <PlayIcon />
            )}
          </button>

          {/* Skip Forward */}
          <button
            onClick={() =>
              onSeek(Math.min(duration || Infinity, currentTime + 10))
            }
            disabled={!canControl || !capabilities.canSeek}
            className="h-9 w-9 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Forward 10s"
          >
            <SkipForwardIcon />
          </button>
        </div>

        {/* Center: Volume */}
        <VolumeControl
          canMute={capabilities.canMute}
          canChangeVolume={capabilities.canChangeVolume}
          displayMuted={displayMuted}
          displayVolume={displayVolume}
          onToggleMute={
            usingLocalAudio ? (onLocalMuteToggle ?? onMuteToggle) : onMuteToggle
          }
          onChangeVolume={(next) =>
            usingLocalAudio
              ? (onLocalVolumeChange ?? onVolumeChange)(next)
              : onVolumeChange(next)
          }
          Icon={VolumeIcon}
        />

        {/* Right: Speed & Settings */}
        <div className="flex items-center gap-2">
          {/* Playback Speed */}
          {capabilities.canChangeSpeed && (
            <PlaybackSpeedMenu
              playbackRate={playbackRate}
              speedOptions={capabilities.speedOptions}
              onPlaybackRateChange={onPlaybackRateChange}
            />
          )}

          {/* More seek options */}
          <div className="hidden sm:flex items-center gap-1">
            <button
              onClick={() => onSeek(Math.max(0, currentTime - 30))}
              disabled={!canControl || !capabilities.canSeek}
              className="h-8 px-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Back 30s"
            >
              -30s
            </button>
            <button
              onClick={() =>
                onSeek(Math.min(duration || Infinity, currentTime + 30))
              }
              disabled={!canControl || !capabilities.canSeek}
              className="h-8 px-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Forward 30s"
            >
              +30s
            </button>
          </div>

          {/* Fullscreen Button */}
          {onFullscreen && (
            <button
              onClick={onFullscreen}
              className="h-9 w-9 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-200 transition-colors"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
            </button>
          )}

          {/* Settings Menu */}
          <SettingsMenu
            capabilities={capabilities}
            platform={platform}
            roomAudioSyncEnabled={roomAudioSyncEnabled}
            onAudioSyncEnabledChange={onAudioSyncEnabledChange}
            onSeek={onSeek}
            currentTime={currentTime}
            duration={duration}
          />
        </div>
      </div>

      {/* Status indicator */}
      {disabled && effectiveDisabledReason && (
        <div className="mt-3 text-center text-xs text-amber-400/80">
          ⚠ {effectiveDisabledReason}
        </div>
      )}
    </div>
  );
}

export default VideoControls;
