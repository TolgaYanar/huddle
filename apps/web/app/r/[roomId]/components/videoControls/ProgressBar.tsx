import React from "react";

import { formatTime } from "./utils";

export function ProgressBar({
  disabled,
  canSeek,
  currentTime,
  duration,
  onSeek,
}: {
  disabled: boolean;
  canSeek: boolean;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
}) {
  const [hoverTime, setHoverTime] = React.useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = React.useState<number>(0);
  const progressRef = React.useRef<HTMLDivElement>(null);

  const handleProgressClick = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (disabled || !canSeek || !progressRef.current || !duration) return;
      const rect = progressRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const percent = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width),
      );
      const newTime = percent * duration;
      onSeek(newTime);
    },
    [disabled, canSeek, duration, onSeek],
  );

  const handleProgressHover = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!progressRef.current || !duration) return;
      const rect = progressRef.current.getBoundingClientRect();
      const percent = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width),
      );
      setHoverTime(percent * duration);
      setHoverPosition(percent * 100);
    },
    [duration],
  );

  const seekEnabled = !disabled && canSeek && duration > 0;
  const safeCurrentTime = Math.max(0, Math.min(duration || 0, currentTime));
  const progress =
    duration > 0
      ? Math.max(0, Math.min(100, (currentTime / duration) * 100))
      : 0;

  const handleProgressKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!seekEnabled) return;
      const smallStep = Math.min(5, duration);
      const largeStep = Math.max(smallStep, duration * 0.1);
      let nextTime: number | null = null;

      switch (e.key) {
        case "ArrowLeft":
        case "ArrowDown":
          nextTime = safeCurrentTime - smallStep;
          break;
        case "ArrowRight":
        case "ArrowUp":
          nextTime = safeCurrentTime + smallStep;
          break;
        case "PageDown":
          nextTime = safeCurrentTime - largeStep;
          break;
        case "PageUp":
          nextTime = safeCurrentTime + largeStep;
          break;
        case "Home":
          nextTime = 0;
          break;
        case "End":
          nextTime = duration;
          break;
        default:
          return;
      }

      e.preventDefault();
      onSeek(Math.max(0, Math.min(duration, nextTime)));
    },
    [duration, onSeek, safeCurrentTime, seekEnabled],
  );

  return (
    <div className="mb-4">
      <div
        ref={progressRef}
        role="slider"
        aria-label="Video progress"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, duration)}
        aria-valuenow={safeCurrentTime}
        aria-valuetext={`${formatTime(safeCurrentTime)} of ${formatTime(duration)}`}
        aria-disabled={!seekEnabled}
        tabIndex={seekEnabled ? 0 : -1}
        className={`relative h-1.5 bg-white/20 rounded-full group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-4 focus-visible:ring-offset-slate-900 ${seekEnabled ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
        onClick={handleProgressClick}
        onKeyDown={handleProgressKeyDown}
        onMouseMove={handleProgressHover}
        onMouseLeave={() => setHoverTime(null)}
      >
        <div
          className="absolute h-full bg-linear-to-r from-indigo-500 to-purple-500 rounded-full transition-all"
          style={{ width: `${progress}%` }}
        />
        {hoverTime !== null && (
          <div
            className="absolute -top-8 transform -translate-x-1/2 px-2 py-1 bg-black/80 text-white text-xs rounded pointer-events-none"
            style={{ left: `${hoverPosition}%` }}
          >
            {formatTime(hoverTime)}
          </div>
        )}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity"
          style={{ left: `calc(${progress}% - 6px)` }}
        />
      </div>
      <div className="flex justify-between mt-1.5 text-xs text-slate-400">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}
