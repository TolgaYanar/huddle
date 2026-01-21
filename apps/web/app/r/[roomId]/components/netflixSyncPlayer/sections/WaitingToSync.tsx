import { AlertCircle, ExternalLink, RefreshCw } from "lucide-react";

import { formatTime } from "../utils";

export function WaitingToSync(props: {
  onStartCountdownSync: () => void;
  onOpenNetflix: () => void;
  currentTime: number;
}) {
  const { onStartCountdownSync, onOpenNetflix, currentTime } = props;

  return (
    <div className="flex flex-col items-center gap-6 p-8 max-w-lg text-center">
      <div className="w-20 h-20 rounded-full bg-yellow-600/20 flex items-center justify-center">
        <AlertCircle className="w-10 h-10 text-yellow-500" />
      </div>

      <div>
        <h2 className="text-xl font-semibold text-white mb-2">Ready to Sync</h2>
        <p className="text-zinc-400 text-sm mb-4">
          Netflix is open in another window. Navigate to the content you want to
          watch, then click the button below to start a countdown sync.
        </p>
        <p className="text-zinc-500 text-xs">
          Tip: Pause the video in Netflix and seek to {formatTime(currentTime)}
          before starting the sync.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <button
          onClick={onStartCountdownSync}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium px-6 py-3 rounded-lg transition-colors"
        >
          <RefreshCw className="w-5 h-5" />
          Start Countdown Sync
        </button>

        <button
          onClick={onOpenNetflix}
          className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          Reopen Netflix Window
        </button>
      </div>
    </div>
  );
}
