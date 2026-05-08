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
 * Teleparty, Scener, and Rave's old "TV Party" all live with. The Huddle
 * Chrome extension (`apps/extension-netflix-party`) is the deliverable for
 * Netflix specifically; for other DRM platforms there's no equivalent today,
 * but everyone in the room can still chat / call / use the playlist.
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

  return (
    <div className="absolute inset-0 flex items-center justify-center p-6 bg-linear-to-b from-slate-950 via-black to-slate-950 text-slate-100">
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
              embedded in a normal webpage. To watch together, everyone needs
              to install the Huddle browser extension (or open {name} in their
              own tab and sync manually).
            </div>
          </div>
        </div>

        {isNetflix && (
          <a
            href="https://chrome.google.com/webstore/category/extensions"
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
              <path d="M12 5v14M5 12h14" />
            </svg>
            Install the Huddle extension for Netflix
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
          The room&rsquo;s chat, voice, and reactions still work — they just
          play alongside whatever you&rsquo;re watching in the other tab.
        </div>
      </div>
    </div>
  );
}
