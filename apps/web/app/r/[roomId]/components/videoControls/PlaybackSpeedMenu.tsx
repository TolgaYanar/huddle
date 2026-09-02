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
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open ? "true" : "false"}
        aria-label={`Playback speed: ${playbackRate}x`}
        className="h-9 px-3 rounded-[var(--radius-control)] bg-surface hover:bg-raised border border-hairline flex items-center gap-1.5 text-ink text-sm font-medium transition-colors"
        title="Playback speed"
      >
        <span>{playbackRate}x</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full mb-2 right-0 min-w-30 bg-black/90 backdrop-blur-md rounded-[var(--radius-control)] border border-hairline py-2 shadow-xl z-50"
        >
          <div className="px-3 py-1.5 text-xs text-ink-muted uppercase tracking-wider">
            Speed
          </div>
          {speedOptions.map((speed) => (
            <button
              key={speed}
              type="button"
              role="menuitemradio"
              aria-checked={playbackRate === speed ? "true" : "false"}
              onClick={() => {
                onPlaybackRateChange(speed);
                setOpen(false);
              }}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-raised transition-colors ${
                playbackRate === speed
                  ? "text-indigo-400 font-medium"
                  : "text-ink"
              }`}
            >
              {speed}x{" "}
              {speed === 1 && <span className="text-ink0">(Normal)</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
