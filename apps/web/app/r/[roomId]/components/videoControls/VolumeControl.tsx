import React from "react";

export function VolumeControl({
  canMute,
  canChangeVolume,
  displayMuted,
  displayVolume,
  onToggleMute,
  onChangeVolume,
  Icon,
}: {
  canMute: boolean;
  canChangeVolume: boolean;
  displayMuted: boolean;
  displayVolume: number;
  onToggleMute: () => void;
  onChangeVolume: (volume: number) => void;
  Icon: React.ComponentType;
}) {
  const [showVolumeSlider, setShowVolumeSlider] = React.useState(false);
  const volumeTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const handleVolumeMouseEnter = () => {
    if (volumeTimeoutRef.current) clearTimeout(volumeTimeoutRef.current);
    setShowVolumeSlider(true);
  };

  const handleVolumeMouseLeave = () => {
    volumeTimeoutRef.current = setTimeout(() => {
      setShowVolumeSlider(false);
    }, 300);
  };

  return (
    <div
      className="relative flex items-center gap-2"
      onMouseEnter={handleVolumeMouseEnter}
      onMouseLeave={handleVolumeMouseLeave}
    >
      <button
        type="button"
        onClick={onToggleMute}
        disabled={!canMute}
        aria-label={displayMuted ? "Unmute" : "Mute"}
        className="h-9 w-9 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title={displayMuted ? "Unmute" : "Mute"}
      >
        <Icon />
      </button>

      {showVolumeSlider && canChangeVolume && (
        <div className="absolute left-full ml-2 flex items-center gap-2 px-3 py-2 bg-black/80 rounded-lg border border-white/10">
          <input
            type="range"
            aria-label="Volume"
            min="0"
            max="1"
            step="0.05"
            value={displayMuted ? 0 : displayVolume}
            onChange={(e) => {
              const next = parseFloat(e.target.value);
              onChangeVolume(next);
            }}
            className="w-20 h-1 accent-white bg-white/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow"
          />
          <span className="text-xs text-slate-300 w-8 text-right">
            {Math.round((displayMuted ? 0 : displayVolume) * 100)}%
          </span>
        </div>
      )}
    </div>
  );
}
