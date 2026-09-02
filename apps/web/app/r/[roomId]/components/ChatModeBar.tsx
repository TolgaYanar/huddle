"use client";

import React from "react";

type ChatModeBarProps = {
  isMuted: boolean;
  onToggleMuted: () => void;
  onShowVideo: () => void;
};

/**
 * Replaces the player area while chat-only mode is on.
 *
 * The player itself is NOT unmounted — it keeps running off-screen so audio
 * and room sync continue. This bar is the only way back, so it must always
 * render both controls: leaving the room's audio playing with no visible way
 * to silence it would be worse than not offering the mode at all.
 */
export function ChatModeBar({
  isMuted,
  onToggleMuted,
  onShowVideo,
}: ChatModeBarProps) {
  return (
    <section
      aria-label="Chat-only mode"
      // Placed explicitly in the column the player used, rather than left to
      // grid auto-placement, which would drop it into the call sidebar's 280px
      // column and squash it.
      className="backdrop-blur-md bg-surface rounded-[var(--radius-panel)] border border-hairline p-4 sm:p-5 flex flex-wrap items-center gap-3 lg:row-start-1 lg:col-start-2 lg:min-w-0 self-start"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span
          aria-hidden="true"
          className={`h-2.5 w-2.5 rounded-full shrink-0 ${
            isMuted ? "bg-ink-faint" : "bg-emerald-400"
          }`}
        />
        <div className="min-w-0">
          <div className="font-semibold text-ink">Chat only</div>
          <div className="text-xs text-ink-muted mt-0.5">
            {isMuted
              ? "The video is hidden and muted for you. Everyone else is unaffected."
              : "The video is hidden but still playing for you, so you can listen while you chat."}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 w-full sm:w-auto">
        <button
          type="button"
          onClick={onToggleMuted}
          aria-pressed={isMuted}
          className="h-10 flex-1 sm:flex-none px-3 sm:px-4 rounded-[var(--radius-control)] border border-hairline bg-sunken hover:bg-sunken text-sm font-medium text-ink transition-colors whitespace-nowrap"
        >
          {isMuted ? "Turn sound on" : "Turn sound off"}
        </button>
        <button
          type="button"
          onClick={onShowVideo}
          className="h-10 flex-1 sm:flex-none px-3 sm:px-4 rounded-[var(--radius-control)] border border-hairline bg-surface hover:bg-raised text-sm font-medium text-ink transition-colors whitespace-nowrap"
        >
          Show video
        </button>
      </div>
    </section>
  );
}
