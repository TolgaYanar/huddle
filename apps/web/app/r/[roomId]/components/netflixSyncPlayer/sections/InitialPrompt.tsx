import { ExternalLink } from "lucide-react";

export function InitialPrompt(props: {
  onOpenNetflix: () => void;
  watchId: string | null;
}) {
  const { onOpenNetflix, watchId } = props;

  return (
    <div className="flex flex-col items-center gap-6 p-8 max-w-lg text-center">
      <div className="w-20 h-20 rounded-full bg-red-600/20 flex items-center justify-center">
        <ExternalLink className="w-10 h-10 text-red-500" />
      </div>

      <div>
        <h2 className="text-xl font-semibold text-white mb-2">
          Netflix Watch Party
        </h2>
        <p className="text-zinc-400 text-sm">
          Netflix will open in a new window. You&apos;ll need to be logged into
          your Netflix account. Use the sync controls below to stay in sync with
          others.
        </p>
      </div>

      <button
        type="button"
        onClick={onOpenNetflix}
        className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-medium px-6 py-3 rounded-lg transition-colors"
      >
        <ExternalLink className="w-5 h-5" />
        Open Netflix
      </button>

      {watchId && <p className="text-zinc-500 text-xs">Title ID: {watchId}</p>}
    </div>
  );
}
