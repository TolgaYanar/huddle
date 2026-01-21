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

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="mb-4">
      <div
        ref={progressRef}
        className="relative h-1.5 bg-white/20 rounded-full cursor-pointer group"
        onClick={handleProgressClick}
        onMouseMove={handleProgressHover}
        onMouseLeave={() => setHoverTime(null)}
      >
        <div className="progressFill absolute h-full bg-linear-to-r from-indigo-500 to-purple-500 rounded-full transition-all" />
        {hoverTime !== null && (
          <div className="hoverTooltip absolute -top-8 transform -translate-x-1/2 px-2 py-1 bg-black/80 text-white text-xs rounded pointer-events-none">
            {formatTime(hoverTime)}
          </div>
        )}
        <div className="scrubber absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <div className="flex justify-between mt-1.5 text-xs text-slate-400">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>

      <style>{`
        .progressFill {
          width: ${progress}%;
        }
        .hoverTooltip {
          left: ${hoverPosition}%;
        }
        .scrubber {
          left: calc(${progress}% - 6px);
        }
      `}</style>
    </div>
  );
}
