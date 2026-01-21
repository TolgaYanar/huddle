import React from "react";

export function PlaybackSpeedMenu({
  playbackRate,
  speedOptions,
  onPlaybackRateChange,
}: {
  playbackRate: number;
  speedOptions: number[];
  onPlaybackRateChange: (speed: number) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="h-9 px-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center gap-1.5 text-slate-200 text-sm font-medium transition-colors"
        title="Playback speed"
      >
        <span>{playbackRate}x</span>
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 right-0 min-w-30 bg-black/90 backdrop-blur-md rounded-xl border border-white/10 py-2 shadow-xl z-50">
          <div className="px-3 py-1.5 text-xs text-slate-400 uppercase tracking-wider">
            Speed
          </div>
          {speedOptions.map((speed) => (
            <button
              key={speed}
              onClick={() => {
                onPlaybackRateChange(speed);
                setOpen(false);
              }}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-white/10 transition-colors ${
                playbackRate === speed
                  ? "text-indigo-400 font-medium"
                  : "text-slate-200"
              }`}
            >
              {speed}x{" "}
              {speed === 1 && <span className="text-slate-500">(Normal)</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
