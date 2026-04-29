export type PlatformType =
  | "youtube"
  | "twitch"
  | "kick"
  | "direct"
  | "prime"
  | "netflix"
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

export interface VideoControlsProps {
  // URL for platform detection
  url: string;

  // State
  isPlaying: boolean;
  muted: boolean;
  volume: number;
  // Optional: effective (per-user) audio, used when "audio sync" is disabled.
  effectiveMuted?: boolean;
  effectiveVolume?: number;
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
  // Optional: local-only volume/mute for when audio shouldn't sync.
  onLocalMuteToggle?: () => void;
  onLocalVolumeChange?: (volume: number) => void;
  // Room-wide setting
  audioSyncEnabled?: boolean;
  onAudioSyncEnabledChange?: (enabled: boolean) => void;
  onPlaybackRateChange: (rate: number) => void;
  onFullscreen?: () => void;

  // Theatre mode (hides the left call sidebar to widen the player)
  isTheatreMode?: boolean;
  onToggleTheatreMode?: () => void;

  // Optional
  isFullscreen?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  className?: string;
  minimal?: boolean;
}
