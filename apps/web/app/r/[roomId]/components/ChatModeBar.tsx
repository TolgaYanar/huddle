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
      className="backdrop-blur-md bg-white/5 rounded-2xl border border-white/10 p-4 sm:p-5 flex flex-wrap items-center gap-3"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span
          aria-hidden="true"
          className={`h-2.5 w-2.5 rounded-full shrink-0 ${
            isMuted ? "bg-slate-500" : "bg-emerald-400"
          }`}
        />
        <div className="min-w-0">
          <div className="font-semibold text-slate-50">Chat only</div>
          <div className="text-xs text-slate-400 mt-0.5">
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
          className="h-10 flex-1 sm:flex-none px-3 sm:px-4 rounded-xl border border-white/10 bg-black/20 hover:bg-black/30 text-sm font-medium text-slate-50 transition-colors whitespace-nowrap"
        >
          {isMuted ? "Turn sound on" : "Turn sound off"}
        </button>
        <button
          type="button"
          onClick={onShowVideo}
          className="h-10 flex-1 sm:flex-none px-3 sm:px-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm font-medium text-slate-50 transition-colors whitespace-nowrap"
        >
          Show video
        </button>
      </div>
    </section>
  );
}
