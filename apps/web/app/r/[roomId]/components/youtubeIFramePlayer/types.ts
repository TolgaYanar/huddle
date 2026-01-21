declare global {
  // Minimal YouTube IFrame API surface we rely on
  type YouTubeIframeApiNamespace = {
    Player: new (
      el: HTMLElement,
      opts: {
        width?: string | number;
        height?: string | number;
        videoId?: string;
        playerVars?: Record<string, unknown>;
        events?: {
          onReady?: () => void;
          onStateChange?: (ev: { data?: unknown }) => void;
          onError?: (ev: { data?: unknown }) => void;
        };
      },
    ) => YTPlayer;
  };

  interface Window {
    YT?: YouTubeIframeApiNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export type YTPlayer = {
  destroy: () => void;
  loadVideoById: (opts: { videoId: string; startSeconds?: number }) => void;
  cueVideoById: (opts: { videoId: string; startSeconds?: number }) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState?: () => number;
  setVolume: (vol: number) => void;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  setPlaybackRate: (rate: number) => void;
  getPlaybackRate: () => number;
  getVideoData?: () => { video_id?: string };
};

export type YouTubeIFramePlayerHandle = {
  play: () => Promise<void>;
  pause: () => void;
  seekTo: (seconds: number, _type?: "seconds" | "fraction") => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getInternalPlayer: () => unknown;
};

export type YouTubeIFramePlayerProps = {
  videoId: string | null;
  startTime?: number | null;
  playing: boolean;
  muted: boolean;
  volume: number;
  playbackRate: number;
  onReady?: () => void;
  onError?: (message: string) => void;
  onEnded?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onDuration?: (dur: number) => void;
  onProgress?: (time: number) => void;
  className?: string;
};

export {};
