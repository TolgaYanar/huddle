"use client";

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import type { NetflixSyncPlayerProps, NetflixSyncPlayerRef } from "./types";
import { extractNetflixWatchId, formatTime } from "./utils";
import { InitialPrompt } from "./sections/InitialPrompt";
import { SyncingCountdown } from "./sections/SyncingCountdown";
import { SyncedControls } from "./sections/SyncedControls";
import { WaitingToSync } from "./sections/WaitingToSync";

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
  ref,
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

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSyncTimeRef = useRef<number>(0);

  const watchId = useMemo(() => extractNetflixWatchId(url), [url]);
  const netflixUrl = useMemo(
    () => (watchId ? `https://www.netflix.com/watch/${watchId}` : url),
    [watchId, url],
  );

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

  useEffect(() => {
    setIsPaused(!isPlaying);
  }, [isPlaying]);

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

  const openNetflix = useCallback(() => {
    const windowFeatures =
      "width=1280,height=720,menubar=no,toolbar=no,location=no,status=no";
    const win = window.open(netflixUrl, "netflix_huddle", windowFeatures);

    if (win) {
      setIsWindowOpen(true);
      setSyncStatus("waiting");

      const checkClosed = setInterval(() => {
        if (win.closed) {
          clearInterval(checkClosed);
          setIsWindowOpen(false);
          setSyncStatus("waiting");
        }
      }, 1000);
    } else {
      onError(
        "Failed to open Netflix window. Please allow popups for this site.",
      );
    }
  }, [netflixUrl, onError]);

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

  const copyTimestamp = useCallback(() => {
    const formatted = formatTime(localTime);
    void navigator.clipboard.writeText(formatted);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [localTime]);

  const handleSeekDelta = useCallback(
    (delta: number) => {
      const newTime = Math.max(0, localTime + delta);
      setLocalTime(newTime);
      onSeek(newTime);
    },
    [localTime, onSeek],
  );

  const handleSetDuration = useCallback(
    (duration: number) => {
      setLocalDuration(duration);
      if (onDuration) {
        onDuration(duration);
      }
    },
    [onDuration],
  );

  const handleTogglePlay = useCallback(() => {
    if (isPaused) {
      setIsPaused(false);
      onPlay();
    } else {
      setIsPaused(true);
      onPause();
    }
  }, [isPaused, onPause, onPlay]);

  useEffect(() => {
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
      <div className="absolute top-4 left-4 flex items-center gap-2">
        <div className="bg-red-600 text-white font-bold px-3 py-1 rounded text-sm">
          NETFLIX
        </div>
        <span className="text-zinc-400 text-sm">Sync Mode</span>
      </div>

      {!isWindowOpen ? (
        <InitialPrompt onOpenNetflix={openNetflix} watchId={watchId} />
      ) : syncStatus === "waiting" ? (
        <WaitingToSync
          onStartCountdownSync={startCountdownSync}
          onOpenNetflix={openNetflix}
          currentTime={currentTime}
        />
      ) : syncStatus === "syncing" ? (
        <SyncingCountdown countdown={countdown} />
      ) : (
        <SyncedControls
          localTime={localTime}
          localDuration={localDuration}
          isPaused={isPaused}
          copied={copied}
          onSeekDelta={handleSeekDelta}
          onTogglePlay={handleTogglePlay}
          onCopyTimestamp={copyTimestamp}
          onResync={startCountdownSync}
          onOpenNetflix={openNetflix}
          onSetDurationSeconds={handleSetDuration}
        />
      )}
    </div>
  );
});

export default NetflixSyncPlayer;
