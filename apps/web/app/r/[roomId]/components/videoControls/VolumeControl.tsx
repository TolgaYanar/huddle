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
  const volumeControlRef = React.useRef<HTMLDivElement>(null);
  const volumeTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const showSlider = React.useCallback(() => {
    if (volumeTimeoutRef.current) clearTimeout(volumeTimeoutRef.current);
    setShowVolumeSlider(true);
  }, []);

  const scheduleSliderHide = React.useCallback(() => {
    if (volumeTimeoutRef.current) clearTimeout(volumeTimeoutRef.current);
    volumeTimeoutRef.current = setTimeout(() => {
      if (!volumeControlRef.current?.contains(document.activeElement)) {
        setShowVolumeSlider(false);
      }
    }, 300);
  }, []);

  React.useEffect(
    () => () => {
      if (volumeTimeoutRef.current) clearTimeout(volumeTimeoutRef.current);
    },
    [],
  );

  React.useEffect(() => {
    if (!showVolumeSlider) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!volumeControlRef.current?.contains(event.target as Node)) {
        setShowVolumeSlider(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [showVolumeSlider]);

  return (
    <div
      ref={volumeControlRef}
      className="relative flex items-center gap-2"
      onMouseEnter={showSlider}
      onMouseLeave={scheduleSliderHide}
      onFocusCapture={showSlider}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setShowVolumeSlider(false);
        }
      }}
      onPointerDown={(event) => {
        if (event.pointerType !== "mouse") showSlider();
      }}
    >
      <button
        type="button"
        onClick={onToggleMute}
        disabled={!canMute}
        aria-label={displayMuted ? "Unmute" : "Mute"}
        className="h-9 w-9 rounded-[var(--radius-control)] bg-surface hover:bg-raised border border-hairline flex items-center justify-center text-ink disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title={displayMuted ? "Unmute" : "Mute"}
      >
        <Icon />
      </button>

      {showVolumeSlider && canChangeVolume && (
        <div className="absolute left-full ml-2 flex items-center gap-2 px-3 py-2 bg-black/80 rounded-[var(--radius-control)] border border-hairline">
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
            className="w-20 h-1 accent-white bg-hairline-strong rounded-full appearance-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-black [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow"
          />
          <span className="text-xs text-ink-muted w-8 text-right">
            {Math.round((displayMuted ? 0 : displayVolume) * 100)}%
          </span>
        </div>
      )}
    </div>
  );
}
