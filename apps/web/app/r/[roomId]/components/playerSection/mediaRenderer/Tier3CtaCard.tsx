"use client";

import React from "react";

import {
  platformDisplayName,
  type PlatformType,
} from "../../videoControls/platform";

/**
 * Card shown in place of the player when someone pastes a DRM-protected URL
 * (Netflix, Prime, Disney+, HBO Max, Hulu, Apple TV+, Paramount+, Peacock).
 *
 * Browsers cannot embed these inline because of `X-Frame-Options: DENY` plus
 * Widevine DRM tied to the top-level browsing context — same constraint that
 * Teleparty, Scener, and Rave's old "TV Party" all live with.
 *
 * For **Netflix specifically** we surface two real, complete paths the rest
 * of this codebase already supports:
 *   1. The Huddle Android app, which drives netflix.com inside a WebView and
 *      injects sync via the same socket events the website uses (see
 *      `mobile/android/.../NetflixWebPlayer.kt`). Built-in app-link support
 *      means tapping the room URL opens the app directly when installed.
 *   2. The Huddle Chrome extension at `apps/extension-netflix-party`, which
 *      hooks into netflix.com inside the user's regular browser tab.
 *
 * For the other Tier-3 platforms we only offer "open in a new tab" today
 * because we don't ship native players for them. Adding e.g. Disney+ or HBO
 * is a multi-day-per-platform integration.
 */
export function Tier3CtaCard({
  platform,
  url,
}: {
  platform: PlatformType;
  url: string;
}) {
  const name = platformDisplayName(platform);
  const isNetflix = platform === "netflix";

  // Tapping this URL on Android opens the Huddle app directly via the
  // app-link intent filter declared in `AndroidManifest.xml`
  // (`<data android:scheme="https" android:host="wehuddle.tv" .../>`); the
  // browser falls back to navigating to the same URL when the app isn't
  // installed. We always show the canonical wehuddle.tv host so the deep
  // link works even when developing on localhost.
  const roomUrl = React.useMemo(() => {
    if (typeof window === "undefined") return "";
    const path = window.location.pathname + window.location.search;
    return `https://wehuddle.tv${path}`;
  }, []);

  return (
    <div className="absolute inset-0 flex items-center justify-center p-6 bg-linear-to-b from-slate-950 via-black to-slate-950 text-slate-100 overflow-y-auto">
      <div className="max-w-md w-full bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-6 flex flex-col gap-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center shrink-0">
            <svg
              className="w-5 h-5 text-amber-300"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 018 0v4" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-base font-semibold text-slate-50">
              {name} can&rsquo;t play inside Huddle
            </div>
            <div className="text-xs text-slate-400 mt-1 leading-relaxed">
              {name} is DRM-protected — browsers don&rsquo;t allow it to be
              embedded in a normal webpage.
              {isNetflix
                ? " Use the Huddle Android app or our Chrome extension to watch together."
                : " Everyone in the room can still chat, talk, and use reactions while watching in their own tab."}
            </div>
          </div>
        </div>

        {isNetflix && roomUrl && (
          <a
            href={roomUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="h-11 rounded-xl border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-100 text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="6" y="2" width="12" height="20" rx="2" />
              <path d="M11 18h2" />
            </svg>
            Continue in Huddle Android app
          </a>
        )}

        {isNetflix && (
          <a
            href="https://chromewebstore.google.com/detail/huddle-for-netflix/mmghgnlloogcifdblldihfmjoefabohc"
            target="_blank"
            rel="noopener noreferrer"
            className="h-10 rounded-xl border border-indigo-500/40 bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-100 text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 3a15 15 0 010 18M3 12h18" />
            </svg>
            Install the Chrome extension
          </a>
        )}

        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="h-10 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-100 text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors"
        >
          Open {name} in a new tab
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 3h7v7M21 3l-9 9M5 5h6M5 19h14a2 2 0 002-2v-6" />
          </svg>
        </a>

        <div className="text-[11px] text-slate-500 leading-relaxed">
          {isNetflix
            ? "Inside the Huddle app, signing into your own Netflix account is required (we don't share accounts). Playback uses the device's native DRM."
            : "The room's chat, voice, and reactions still work — they just play alongside whatever you're watching in the other tab."}
        </div>
      </div>
    </div>
  );
}
