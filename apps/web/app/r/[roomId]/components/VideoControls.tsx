"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";

// Platform capabilities - what each source supports
export type PlatformType =
  | "youtube"
  | "twitch"
  | "kick"
  | "direct"
  | "prime"
  | "unknown";

export interface PlatformCapabilities {
  canPlay: boolean;
  canPause: boolean;
  canSeek: boolean;
  canMute: boolean;
  canChangeSpeed: boolean;
  canChangeVolume: boolean;
  canGetDuration: boolean;
  canGetCurrentTime: boolean;
  speedOptions: number[];
}

export const PLATFORM_CAPABILITIES: Record<PlatformType, PlatformCapabilities> =
  {
    youtube: {
      canPlay: true,
      canPause: true,
      canSeek: true,
      canMute: true,
      canChangeSpeed: true,
      canChangeVolume: true,
      canGetDuration: true,
      canGetCurrentTime: true,
      speedOptions: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
    },
    direct: {
      canPlay: true,
      canPause: true,
      canSeek: true,
      canMute: true,
      canChangeSpeed: true,
      canChangeVolume: true,
      canGetDuration: true,
      canGetCurrentTime: true,
      speedOptions: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3],
    },
    twitch: {
      canPlay: false,
      canPause: false,
      canSeek: false,
      canMute: false,
      canChangeSpeed: false,
      canChangeVolume: false,
      canGetDuration: false,
      canGetCurrentTime: false,
      speedOptions: [],
    },
    kick: {
      canPlay: false,
      canPause: false,
      canSeek: false,
      canMute: false,
      canChangeSpeed: false,
      canChangeVolume: false,
      canGetDuration: false,
      canGetCurrentTime: false,
      speedOptions: [],
    },
    prime: {
      canPlay: false,
      canPause: false,
      canSeek: false,
      canMute: false,
      canChangeSpeed: false,
      canChangeVolume: false,
      canGetDuration: false,
      canGetCurrentTime: false,
      speedOptions: [],
    },
    unknown: {
      canPlay: true,
      canPause: true,
      canSeek: true,
      canMute: true,
      canChangeSpeed: true,
      canChangeVolume: true,
      canGetDuration: true,
      canGetCurrentTime: true,
      speedOptions: [0.5, 0.75, 1, 1.25, 1.5, 2],
    },
  };

export function detectPlatform(url: string): PlatformType {
  if (!url) return "unknown";
  const lower = url.toLowerCase();
  if (lower.includes("youtube.com") || lower.includes("youtu.be"))
    return "youtube";
  if (lower.includes("twitch.tv")) return "twitch";
  if (lower.includes("kick.com")) return "kick";
  if (lower.includes("primevideo") || lower.includes("amazon.com/gp/video"))
    return "prime";
  // Check for direct video files
  if (/\.(mp4|webm|ogg|m3u8|mkv|avi|mov)(\?|$)/i.test(url)) return "direct";
  return "unknown";
}

interface VideoControlsProps {
  // URL for platform detection
  url: string;

  // State
  isPlaying: boolean;
  muted: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  playbackRate: number;
  isBuffering: boolean;

  // Callbacks
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onMuteToggle: () => void;
  onVolumeChange: (volume: number) => void;
  onPlaybackRateChange: (rate: number) => void;
  onFullscreen?: () => void;

  // Optional
  isFullscreen?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  className?: string;
  minimal?: boolean;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Icons as simple SVG components for better control
const PlayIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const PauseIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
  </svg>
);

const VolumeHighIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
  </svg>
);

const VolumeMuteIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
  </svg>
);

const VolumeLowIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z" />
  </svg>
);

const SkipBackIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" />
  </svg>
);

const SkipForwardIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
  </svg>
);

const SettingsIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
  </svg>
);

const FullscreenIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
  </svg>
);

const ExitFullscreenIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
  </svg>
);
export function VideoControls({
  url,
  isPlaying,
  muted,
  volume,
  currentTime,
  duration,
  playbackRate,
  isBuffering,
  onPlay,
  onPause,
  onSeek,
  onMuteToggle,
  onVolumeChange,
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
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number>(0);

  const progressRef = useRef<HTMLDivElement>(null);
  const volumeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const speedMenuRef = useRef<HTMLDivElement>(null);
  const settingsMenuRef = useRef<HTMLDivElement>(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        speedMenuRef.current &&
        !speedMenuRef.current.contains(e.target as Node)
      ) {
        setShowSpeedMenu(false);
      }
      if (
        settingsMenuRef.current &&
        !settingsMenuRef.current.contains(e.target as Node)
      ) {
        setShowSettingsMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (
        disabled ||
        !capabilities.canSeek ||
        !progressRef.current ||
        !duration
      )
        return;
      const rect = progressRef.current.getBoundingClientRect();
      const percent = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width)
      );
      const newTime = percent * duration;
      onSeek(newTime);
    },
    [disabled, capabilities.canSeek, duration, onSeek]
  );

  const handleProgressHover = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!progressRef.current || !duration) return;
      const rect = progressRef.current.getBoundingClientRect();
      const percent = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width)
      );
      setHoverTime(percent * duration);
      setHoverPosition(percent * 100);
    },
    [duration]
  );

  const handleVolumeMouseEnter = () => {
    if (volumeTimeoutRef.current) {
      clearTimeout(volumeTimeoutRef.current);
    }
    setShowVolumeSlider(true);
  };

  const handleVolumeMouseLeave = () => {
    volumeTimeoutRef.current = setTimeout(() => {
      setShowVolumeSlider(false);
    }, 300);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const VolumeIcon =
    muted || volume === 0
      ? VolumeMuteIcon
      : volume < 0.5
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
        <div className="mb-4">
          <div
            ref={progressRef}
            className="relative h-1.5 bg-white/20 rounded-full cursor-pointer group"
            onClick={handleProgressClick}
            onMouseMove={handleProgressHover}
            onMouseLeave={() => setHoverTime(null)}
          >
            {/* Buffered indicator could go here */}
            <div
              className="absolute h-full bg-linear-to-r from-indigo-500 to-purple-500 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
            {/* Hover indicator */}
            {hoverTime !== null && (
              <div
                className="absolute -top-8 transform -translate-x-1/2 px-2 py-1 bg-black/80 text-white text-xs rounded pointer-events-none"
                style={{ left: `${hoverPosition}%` }}
              >
                {formatTime(hoverTime)}
              </div>
            )}
            {/* Scrubber handle */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `calc(${progress}% - 6px)` }}
            />
          </div>
          <div className="flex justify-between mt-1.5 text-xs text-slate-400">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
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
        <div
          className="relative flex items-center gap-2"
          onMouseEnter={handleVolumeMouseEnter}
          onMouseLeave={handleVolumeMouseLeave}
        >
          <button
            onClick={onMuteToggle}
            disabled={!capabilities.canMute}
            className="h-9 w-9 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title={muted ? "Unmute" : "Mute"}
          >
            <VolumeIcon />
          </button>

          {/* Volume Slider */}
          {showVolumeSlider && capabilities.canChangeVolume && (
            <div className="absolute left-full ml-2 flex items-center gap-2 px-3 py-2 bg-black/80 rounded-lg border border-white/10">
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={muted ? 0 : volume}
                onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                className="w-20 h-1 accent-white bg-white/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow"
              />
              <span className="text-xs text-slate-300 w-8 text-right">
                {Math.round((muted ? 0 : volume) * 100)}%
              </span>
            </div>
          )}
        </div>

        {/* Right: Speed & Settings */}
        <div className="flex items-center gap-2">
          {/* Playback Speed */}
          {capabilities.canChangeSpeed && (
            <div className="relative" ref={speedMenuRef}>
              <button
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className="h-9 px-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center gap-1.5 text-slate-200 text-sm font-medium transition-colors"
                title="Playback speed"
              >
                <span>{playbackRate}x</span>
              </button>

              {showSpeedMenu && (
                <div className="absolute bottom-full mb-2 right-0 min-w-30 bg-black/90 backdrop-blur-md rounded-xl border border-white/10 py-2 shadow-xl z-50">
                  <div className="px-3 py-1.5 text-xs text-slate-400 uppercase tracking-wider">
                    Speed
                  </div>
                  {capabilities.speedOptions.map((speed) => (
                    <button
                      key={speed}
                      onClick={() => {
                        onPlaybackRateChange(speed);
                        setShowSpeedMenu(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-white/10 transition-colors ${
                        playbackRate === speed
                          ? "text-indigo-400 font-medium"
                          : "text-slate-200"
                      }`}
                    >
                      {speed}x{" "}
                      {speed === 1 && (
                        <span className="text-slate-500">(Normal)</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
          <div className="relative" ref={settingsMenuRef}>
            <button
              onClick={() => setShowSettingsMenu(!showSettingsMenu)}
              className="h-9 w-9 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-200 transition-colors"
              title="Settings"
            >
              <SettingsIcon />
            </button>

            {showSettingsMenu && (
              <div className="absolute bottom-full mb-2 right-0 min-w-50 bg-black/90 backdrop-blur-md rounded-xl border border-white/10 py-2 shadow-xl z-50">
                <div className="px-3 py-1.5 text-xs text-slate-400 uppercase tracking-wider">
                  Quick Actions
                </div>

                <button
                  onClick={() => {
                    onSeek(Math.max(0, currentTime - 5));
                    setShowSettingsMenu(false);
                  }}
                  disabled={!capabilities.canSeek}
                  className="w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/10 transition-colors disabled:opacity-40"
                >
                  ⏪ Back 5 seconds
                </button>
                <button
                  onClick={() => {
                    onSeek(Math.min(duration || Infinity, currentTime + 5));
                    setShowSettingsMenu(false);
                  }}
                  disabled={!capabilities.canSeek}
                  className="w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/10 transition-colors disabled:opacity-40"
                >
                  ⏩ Forward 5 seconds
                </button>
                <button
                  onClick={() => {
                    onSeek(0);
                    setShowSettingsMenu(false);
                  }}
                  disabled={!capabilities.canSeek}
                  className="w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/10 transition-colors disabled:opacity-40"
                >
                  ⏮ Restart
                </button>

                <div className="border-t border-white/10 my-2" />

                <div className="px-3 py-1.5 text-xs text-slate-400 uppercase tracking-wider">
                  Platform
                </div>
                <div className="px-3 py-2 text-sm text-slate-300">
                  {platform === "youtube" && "YouTube"}
                  {platform === "twitch" && "Twitch (Limited control)"}
                  {platform === "kick" && "Kick (Limited control)"}
                  {platform === "prime" && "Prime Video (No control)"}
                  {platform === "direct" && "Direct video file"}
                  {platform === "unknown" && "Unknown source"}
                </div>

                <div className="px-3 py-2">
                  <div className="text-xs text-slate-500">
                    {capabilities.canPlay
                      ? "✓ Playback control"
                      : "✗ No playback control"}
                  </div>
                  <div className="text-xs text-slate-500">
                    {capabilities.canSeek ? "✓ Seeking" : "✗ No seeking"}
                  </div>
                  <div className="text-xs text-slate-500">
                    {capabilities.canChangeSpeed
                      ? "✓ Speed control"
                      : "✗ No speed control"}
                  </div>
                </div>
              </div>
            )}
          </div>
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
