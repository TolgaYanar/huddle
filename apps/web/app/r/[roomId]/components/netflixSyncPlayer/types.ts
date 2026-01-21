export interface NetflixSyncPlayerProps {
  url: string;
  isPlaying: boolean;
  currentTime: number;
  volume: number;
  muted: boolean;
  playbackRate: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onProgress: (time: number, duration: number) => void;
  onReady: () => void;
  onError: (error: string) => void;
  onDuration?: (duration: number) => void;
  className?: string;
}

export interface NetflixSyncPlayerRef {
  seekTo: (time: number) => void;
  play: () => void;
  pause: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
}
