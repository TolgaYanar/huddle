import React from "react";

import { SettingsIcon } from "./icons";
import type { PlatformCapabilities, PlatformType } from "./types";

export function SettingsMenu({
  capabilities,
  platform,
  roomAudioSyncEnabled,
  onAudioSyncEnabledChange,
  onSeek,
  currentTime,
  duration,
}: {
  capabilities: PlatformCapabilities;
  platform: PlatformType;
  roomAudioSyncEnabled: boolean;
  onAudioSyncEnabledChange?: (enabled: boolean) => void;
  onSeek: (time: number) => void;
  currentTime: number;
  duration: number;
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
        aria-haspopup="dialog"
        aria-expanded={open ? "true" : "false"}
        aria-label="Player settings"
        className="h-9 w-9 rounded-[var(--radius-control)] bg-surface hover:bg-raised border border-hairline flex items-center justify-center text-ink transition-colors"
        title="Settings"
      >
        <SettingsIcon />
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 right-0 min-w-50 bg-black/90 backdrop-blur-md rounded-[var(--radius-control)] border border-hairline py-2 shadow-xl z-50">
          <div className="px-3 py-1.5 text-xs text-ink-muted uppercase tracking-wider">
            Quick Actions
          </div>

          <button
            type="button"
            onClick={() => {
              onSeek(Math.max(0, currentTime - 5));
              setOpen(false);
            }}
            disabled={!capabilities.canSeek}
            className="w-full px-3 py-2 text-left text-sm text-ink hover:bg-raised transition-colors disabled:opacity-40"
          >
            ⏪ Back 5 seconds
          </button>
          <button
            type="button"
            onClick={() => {
              onSeek(Math.min(duration || Infinity, currentTime + 5));
              setOpen(false);
            }}
            disabled={!capabilities.canSeek}
            className="w-full px-3 py-2 text-left text-sm text-ink hover:bg-raised transition-colors disabled:opacity-40"
          >
            ⏩ Forward 5 seconds
          </button>
          <button
            type="button"
            onClick={() => {
              onSeek(0);
              setOpen(false);
            }}
            disabled={!capabilities.canSeek}
            className="w-full px-3 py-2 text-left text-sm text-ink hover:bg-raised transition-colors disabled:opacity-40"
          >
            ⏮ Restart
          </button>

          <div className="border-t border-hairline my-2" />

          <div className="px-3 py-1.5 text-xs text-ink-muted uppercase tracking-wider">
            Audio
          </div>
          <label className="px-3 py-2 flex items-center justify-between gap-3 text-sm text-ink select-none">
            <span>Sync volume & mute</span>
            <input
              type="checkbox"
              checked={roomAudioSyncEnabled}
              onChange={(e) => onAudioSyncEnabledChange?.(e.target.checked)}
              className="h-4 w-4 accent-indigo-500"
            />
          </label>
          {!roomAudioSyncEnabled && (
            <div className="px-3 pb-2 text-xs text-ink-muted">
              Volume/mute are local. Speed still syncs.
            </div>
          )}

          <div className="border-t border-hairline my-2" />

          <div className="px-3 py-1.5 text-xs text-ink-muted uppercase tracking-wider">
            Platform
          </div>
          <div className="px-3 py-2 text-sm text-ink-muted">
            {platform === "youtube" && "YouTube"}
            {platform === "twitch" && "Twitch (Limited control)"}
            {platform === "kick" && "Kick (Limited control)"}
            {platform === "prime" && "Prime Video (No control)"}
            {platform === "direct" && "Direct video file"}
            {platform === "unknown" && "Unknown source"}
            {platform === "netflix" && "Netflix"}
          </div>

          <div className="px-3 py-2">
            <div className="text-xs text-ink0">
              {capabilities.canPlay
                ? "✓ Playback control"
                : "✗ No playback control"}
            </div>
            <div className="text-xs text-ink0">
              {capabilities.canSeek ? "✓ Seeking" : "✗ No seeking"}
            </div>
            <div className="text-xs text-ink0">
              {capabilities.canChangeSpeed
                ? "✓ Speed control"
                : "✗ No speed control"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
