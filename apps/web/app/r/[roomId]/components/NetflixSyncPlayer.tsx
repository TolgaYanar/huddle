"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  Copy,
  Check,
} from "lucide-react";

interface NetflixSyncPlayerProps {
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

/**
 * Netflix Sync Player for Web
 *
 * Since Netflix blocks iframes and doesn't provide an embed API,
 * this component opens Netflix in a new window and provides a
 * synchronized control overlay for manual sync.
 *
 * Users must have their own Netflix account and be logged in.
 */
export const NetflixSyncPlayer = forwardRef<
  NetflixSyncPlayerRef,
  NetflixSyncPlayerProps
>(function NetflixSyncPlayer(
  {
    url,
    isPlaying,
    currentTime,
    volume: _volume,
    muted: _muted,
    playbackRate,
    onPlay,
    onPause,
    onSeek,
    onProgress,
    onReady,
    onError,
    onDuration,
    className,
  },
  ref
) {
  // volume and muted are accepted but not used in manual sync mode
  // since we can't control the Netflix window directly
  void _volume;
  void _muted;

  const [isWindowOpen, setIsWindowOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<
    "waiting" | "syncing" | "synced"
  >("waiting");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [localTime, setLocalTime] = useState(currentTime);
  const [localDuration, setLocalDuration] = useState(0);
  const [isPaused, setIsPaused] = useState(!isPlaying);

  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const progressRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncTimeRef = useRef<number>(0);

  // Extract Netflix watch ID
  const watchId = extractNetflixWatchId(url);
  const netflixUrl = watchId ? `https://www.netflix.com/watch/${watchId}` : url;

  // Simulated progress tracking (since we can't read from Netflix window)
  useEffect(() => {
    if (progressRef.current) {
      clearInterval(progressRef.current);
    }

    if (!isPaused && syncStatus === "synced") {
      progressRef.current = setInterval(() => {
        setLocalTime((prev) => {
          const newTime = prev + playbackRate * 0.5;
          onProgress(newTime, localDuration);
          return newTime;
        });
      }, 500);
    }

    return () => {
      if (progressRef.current) {
        clearInterval(progressRef.current);
      }
    };
  }, [isPaused, syncStatus, playbackRate, localDuration, onProgress]);

  // Sync with room state
  useEffect(() => {
    const now = Date.now();
    const timeSinceLastSync = now - lastSyncTimeRef.current;

    // Only sync if significant time difference and not too frequent
    if (timeSinceLastSync > 2000 && Math.abs(currentTime - localTime) > 3) {
      setLocalTime(currentTime);
      lastSyncTimeRef.current = now;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime]); // Intentionally excluding localTime to prevent infinite loops

  // Sync play/pause
  useEffect(() => {
    setIsPaused(!isPlaying);
  }, [isPlaying]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    seekTo: (time: number) => {
      setLocalTime(time);
      lastSyncTimeRef.current = Date.now();
    },
    play: () => {
      setIsPaused(false);
      onPlay();
    },
    pause: () => {
      setIsPaused(true);
      onPause();
    },
    getCurrentTime: () => localTime,
    getDuration: () => localDuration,
  }));

  // Open Netflix in new window
  const openNetflix = useCallback(() => {
    const windowFeatures =
      "width=1280,height=720,menubar=no,toolbar=no,location=no,status=no";
    const win = window.open(netflixUrl, "netflix_huddle", windowFeatures);

    if (win) {
      setIsWindowOpen(true);
      setSyncStatus("waiting");

      // Check if window is closed
      const checkClosed = setInterval(() => {
        if (win.closed) {
          clearInterval(checkClosed);
          setIsWindowOpen(false);
          setSyncStatus("waiting");
        }
      }, 1000);
    } else {
      onError(
        "Failed to open Netflix window. Please allow popups for this site."
      );
    }
  }, [netflixUrl, onError]);

  // Start countdown sync
  const startCountdownSync = useCallback(() => {
    setSyncStatus("syncing");
    setCountdown(5);

    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          if (countdownRef.current) {
            clearInterval(countdownRef.current);
          }
          setSyncStatus("synced");
          setLocalTime(currentTime);
          setIsPaused(!isPlaying);
          onReady();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, [currentTime, isPlaying, onReady]);

  // Copy timestamp to clipboard
  const copyTimestamp = useCallback(() => {
    const formatted = formatTime(localTime);
    navigator.clipboard.writeText(formatted);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [localTime]);

  // Manual seek
  const handleSeek = useCallback(
    (delta: number) => {
      const newTime = Math.max(0, localTime + delta);
      setLocalTime(newTime);
      onSeek(newTime);
    },
    [localTime, onSeek]
  );

  // Set duration (for manual entry)
  const handleSetDuration = useCallback(
    (duration: number) => {
      setLocalDuration(duration);
      if (onDuration) {
        onDuration(duration);
      }
    },
    [onDuration]
  );

  // Cleanup on unmount
  useEffect(() => {
    // Capture refs for cleanup
    const countdownTimer = countdownRef.current;
    const progressTimer = progressRef.current;

    return () => {
      if (countdownTimer) clearInterval(countdownTimer);
      if (progressTimer) clearInterval(progressTimer);
    };
  }, []);

  return (
    <div
      className={`relative w-full h-full bg-black flex flex-col items-center justify-center ${className || ""}`}
    >
      {/* Netflix branding header */}
      <div className="absolute top-4 left-4 flex items-center gap-2">
        <div className="bg-red-600 text-white font-bold px-3 py-1 rounded text-sm">
          NETFLIX
        </div>
        <span className="text-zinc-400 text-sm">Sync Mode</span>
      </div>

      {!isWindowOpen ? (
        /* Initial state - prompt to open Netflix */
        <div className="flex flex-col items-center gap-6 p-8 max-w-lg text-center">
          <div className="w-20 h-20 rounded-full bg-red-600/20 flex items-center justify-center">
            <ExternalLink className="w-10 h-10 text-red-500" />
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-2">
              Netflix Watch Party
            </h2>
            <p className="text-zinc-400 text-sm">
              Netflix will open in a new window. You&apos;ll need to be logged
              into your Netflix account. Use the sync controls below to stay in
              sync with others.
            </p>
          </div>

          <button
            onClick={openNetflix}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-medium px-6 py-3 rounded-lg transition-colors"
          >
            <ExternalLink className="w-5 h-5" />
            Open Netflix
          </button>

          {watchId && (
            <p className="text-zinc-500 text-xs">Title ID: {watchId}</p>
          )}
        </div>
      ) : syncStatus === "waiting" ? (
        /* Waiting to sync */
        <div className="flex flex-col items-center gap-6 p-8 max-w-lg text-center">
          <div className="w-20 h-20 rounded-full bg-yellow-600/20 flex items-center justify-center">
            <AlertCircle className="w-10 h-10 text-yellow-500" />
          </div>

          <div>
            <h2 className="text-xl font-semibold text-white mb-2">
              Ready to Sync
            </h2>
            <p className="text-zinc-400 text-sm mb-4">
              Netflix is open in another window. Navigate to the content you
              want to watch, then click the button below to start a countdown
              sync.
            </p>
            <p className="text-zinc-500 text-xs">
              Tip: Pause the video in Netflix and seek to{" "}
              {formatTime(currentTime)}
              before starting the sync.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={startCountdownSync}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium px-6 py-3 rounded-lg transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
              Start Countdown Sync
            </button>

            <button
              onClick={openNetflix}
              className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Reopen Netflix Window
            </button>
          </div>
        </div>
      ) : syncStatus === "syncing" ? (
        /* Countdown in progress */
        <div className="flex flex-col items-center gap-6 p-8">
          <div className="text-8xl font-bold text-white animate-pulse">
            {countdown}
          </div>
          <p className="text-zinc-400 text-lg">
            Press play in Netflix when countdown reaches 0
          </p>
        </div>
      ) : (
        /* Synced - show controls */
        <div className="flex flex-col items-center gap-6 p-8 max-w-lg w-full">
          <div className="flex items-center gap-2 text-green-500">
            <Check className="w-5 h-5" />
            <span className="text-sm font-medium">Synced with room</span>
          </div>

          {/* Current time display */}
          <div className="bg-zinc-900 rounded-lg p-6 w-full">
            <div className="text-center mb-4">
              <div className="text-4xl font-mono text-white mb-1">
                {formatTime(localTime)}
              </div>
              {localDuration > 0 && (
                <div className="text-zinc-500 text-sm">
                  / {formatTime(localDuration)}
                </div>
              )}
            </div>

            {/* Playback controls */}
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => handleSeek(-10)}
                className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
                title="Back 10s"
              >
                <SkipBack className="w-6 h-6 text-zinc-400" />
              </button>

              <button
                onClick={() => {
                  if (isPaused) {
                    setIsPaused(false);
                    onPlay();
                  } else {
                    setIsPaused(true);
                    onPause();
                  }
                }}
                className="p-4 bg-white hover:bg-zinc-200 rounded-full transition-colors"
              >
                {isPaused ? (
                  <Play className="w-8 h-8 text-black" fill="black" />
                ) : (
                  <Pause className="w-8 h-8 text-black" fill="black" />
                )}
              </button>

              <button
                onClick={() => handleSeek(10)}
                className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
                title="Forward 10s"
              >
                <SkipForward className="w-6 h-6 text-zinc-400" />
              </button>
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={copyTimestamp}
              className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm transition-colors px-3 py-2 rounded-lg hover:bg-zinc-800"
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              Copy Timestamp
            </button>

            <button
              onClick={startCountdownSync}
              className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm transition-colors px-3 py-2 rounded-lg hover:bg-zinc-800"
            >
              <RefreshCw className="w-4 h-4" />
              Re-sync
            </button>

            <button
              onClick={openNetflix}
              className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm transition-colors px-3 py-2 rounded-lg hover:bg-zinc-800"
            >
              <ExternalLink className="w-4 h-4" />
              Open Netflix
            </button>
          </div>

          {/* Duration input for accurate progress */}
          <div className="w-full">
            <label className="text-zinc-500 text-xs block mb-2">
              Content Duration (optional, for progress tracking)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g., 1:45:30"
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm placeholder:text-zinc-600"
                onBlur={(e) => {
                  const duration = parseTime(e.target.value);
                  if (duration > 0) {
                    handleSetDuration(duration);
                  }
                }}
              />
            </div>
          </div>

          {/* Instructions */}
          <div className="text-zinc-500 text-xs text-center">
            <p>Keep the Netflix window open and control playback from there.</p>
            <p>Use these controls to keep everyone in sync.</p>
          </div>
        </div>
      )}
    </div>
  );
});

/**
 * Extract Netflix watch ID from URL
 */
function extractNetflixWatchId(url: string): string | null {
  const patterns = [/netflix\.com\/watch\/(\d+)/, /netflix\.com\/title\/(\d+)/];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

/**
 * Format seconds to time string (H:MM:SS or M:SS)
 */
function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Parse time string to seconds
 */
function parseTime(timeStr: string): number {
  const parts = timeStr.split(":").map(Number);

  // Ensure all parts are valid numbers
  const [first, second, third] = parts;

  if (
    parts.length === 3 &&
    first !== undefined &&
    second !== undefined &&
    third !== undefined
  ) {
    // H:MM:SS
    if (!isNaN(first) && !isNaN(second) && !isNaN(third)) {
      return first * 3600 + second * 60 + third;
    }
  } else if (
    parts.length === 2 &&
    first !== undefined &&
    second !== undefined
  ) {
    // M:SS
    if (!isNaN(first) && !isNaN(second)) {
      return first * 60 + second;
    }
  } else if (parts.length === 1 && first !== undefined && !isNaN(first)) {
    // Just seconds
    return first;
  }

  return 0;
}

export default NetflixSyncPlayer;
