"use client";

import React from "react";

interface UnmuteHintProps {
  /** Whether the player is currently muted (effective, not just intent). */
  muted: boolean;
  /** Whether the player has finished loading; we don't show on a black "Loading…" screen. */
  playerReady: boolean;
  /** "Playing" | "Paused" | …  — only show while actually playing. */
  videoState: string;
  /** Click handler to unmute the player. */
  onUnmute: () => void;
}

/**
 * Floating prompt shown to late joiners whose video is muted because the
 * browser blocked unmuted autoplay. Disappears as soon as the user acts.
 *
 * The component dismisses itself permanently (per page-load) once the user
 * either clicks "Tap for sound" or closes it, so we don't keep nagging.
 */
export function UnmuteHint({
  muted,
  playerReady,
  videoState,
  onUnmute,
}: UnmuteHintProps) {
  const [dismissed, setDismissed] = React.useState(false);

  // Reset dismissal whenever the player is unmuted (e.g. via the controls);
  // we'll only show again if mute happens again from a fresh URL change.
  React.useEffect(() => {
    if (!muted) setDismissed(false);
  }, [muted]);

  const visible =
    !dismissed && muted && playerReady && videoState === "Playing";

  if (!visible) return null;

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
      <div className="flex items-center gap-2 px-3 py-2 rounded-2xl border border-white/15 bg-black/70 backdrop-blur-md shadow-xl">
        <button
          type="button"
          onClick={() => {
            onUnmute();
            setDismissed(true);
          }}
          className="flex items-center gap-2 px-3 h-8 rounded-xl bg-white text-slate-900 text-sm font-semibold hover:bg-slate-100 transition-colors"
          aria-label="Tap for sound"
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
          Tap for sound
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss unmute prompt"
          className="h-8 w-8 inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 text-sm hover:bg-white/10 hover:text-white transition-colors"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    </div>
  );
}
