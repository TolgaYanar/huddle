import {
  Check,
  Copy,
  ExternalLink,
  Pause,
  Play,
  RefreshCw,
  SkipBack,
  SkipForward,
} from "lucide-react";

import { formatTime, parseTime } from "../utils";

export function SyncedControls(props: {
  localTime: number;
  localDuration: number;
  isPaused: boolean;
  copied: boolean;
  onSeekDelta: (deltaSeconds: number) => void;
  onTogglePlay: () => void;
  onCopyTimestamp: () => void;
  onResync: () => void;
  onOpenNetflix: () => void;
  onSetDurationSeconds: (durationSeconds: number) => void;
}) {
  const {
    localTime,
    localDuration,
    isPaused,
    copied,
    onSeekDelta,
    onTogglePlay,
    onCopyTimestamp,
    onResync,
    onOpenNetflix,
    onSetDurationSeconds,
  } = props;

  return (
    <div className="flex flex-col items-center gap-6 p-8 max-w-lg w-full">
      <div className="flex items-center gap-2 text-green-500">
        <Check className="w-5 h-5" />
        <span className="text-sm font-medium">Synced with room</span>
      </div>

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

        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => onSeekDelta(-10)}
            aria-label="Skip back 10 seconds"
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
            title="Back 10s"
          >
            <SkipBack className="w-6 h-6 text-zinc-400" />
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPaused ? "Play" : "Pause"}
            className="p-4 bg-white hover:bg-zinc-200 rounded-full transition-colors"
          >
            {isPaused ? (
              <Play className="w-8 h-8 text-black" fill="black" />
            ) : (
              <Pause className="w-8 h-8 text-black" fill="black" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onSeekDelta(10)}
            aria-label="Skip forward 10 seconds"
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
            title="Forward 10s"
          >
            <SkipForward className="w-6 h-6 text-zinc-400" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onCopyTimestamp}
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
          type="button"
          onClick={onResync}
          className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm transition-colors px-3 py-2 rounded-lg hover:bg-zinc-800"
        >
          <RefreshCw className="w-4 h-4" />
          Re-sync
        </button>

        <button
          type="button"
          onClick={onOpenNetflix}
          className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm transition-colors px-3 py-2 rounded-lg hover:bg-zinc-800"
        >
          <ExternalLink className="w-4 h-4" />
          Open Netflix
        </button>
      </div>

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
                onSetDurationSeconds(duration);
              }
            }}
          />
        </div>
      </div>

      <div className="text-zinc-500 text-xs text-center">
        <p>Keep the Netflix window open and control playback from there.</p>
        <p>Use these controls to keep everyone in sync.</p>
      </div>
    </div>
  );
}
