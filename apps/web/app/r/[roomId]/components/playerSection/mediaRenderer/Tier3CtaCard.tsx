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
 * The Huddle extension is what makes watching together possible; it runs the
 * sync logic inside the streaming site's own tab. It supports two platforms,
 * which get a guided "install the extension" flow here:
 *   - **Netflix** — always-on (`content_scripts` match netflix.com/watch).
 *     Also playable in the Huddle Android app, which drives netflix.com inside
 *     a WebView (`mobile/android/.../NetflixWebPlayer.kt`) and app-links from
 *     the room URL.
 *   - **Prime Video** — opt-in behind the extension's `optional_host_permissions`
 *     for primevideo.com (supported series only). The Android app has no Prime
 *     player, so it is not offered for Prime.
 *
 * The other Tier-3 platforms only get "open in a new tab" today because we
 * don't ship a player for them — adding e.g. Disney+ or HBO is a multi-day-
 * per-platform integration.
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
  const isPrime = platform === "prime";
  // Platforms the Huddle extension actually drives — these lead with a guided
  // install flow rather than a bare "open in a new tab".
  const extensionSupported = isNetflix || isPrime;
  // Only Netflix has a native Android player; don't deep-link Prime into the
  // app, where it would dead-end on the app's own CTA card.
  const androidSupported = isNetflix;

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

  const steps = isPrime
    ? [
        "Install the Huddle extension and allow it to run on Prime Video when asked.",
        "Open the Prime Video title and sign in with your own account.",
        "Play, pause, and seek stay in sync for everyone in the room.",
      ]
    : [
        "Install the Huddle extension — a one-time setup.",
        "Open the Netflix title and sign in with your own account.",
        "Play, pause, and seek stay in sync for everyone in the room.",
      ];

  return (
    <div // Sits on the video stage, which is black in both themes, so its ink is
      // fixed light rather than themed.
      className="absolute inset-0 flex items-center justify-center p-6 bg-black text-white overflow-y-auto"
    >
      <div className="max-w-md w-full bg-surface backdrop-blur-md rounded-[var(--radius-panel)] border border-hairline p-6 flex flex-col gap-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-[var(--radius-control)] bg-amber-400/15 border border-amber-400/30 flex items-center justify-center shrink-0">
            <svg
              className="w-5 h-5 text-accent"
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
            <div className="text-base font-semibold text-ink">
              {extensionSupported
                ? `Watch ${name} together`
                : `${name} can’t play inside Huddle`}
            </div>
            <div className="text-xs text-ink-muted mt-1 leading-relaxed">
              {name} is DRM-protected, so browsers don&rsquo;t allow it to be
              embedded in a webpage.
              {extensionSupported
                ? ` Add the free Huddle extension and playback syncs in your own ${name} tab.`
                : " Everyone in the room can still chat, talk, and use reactions while watching in their own tab."}
            </div>
          </div>
        </div>

        {extensionSupported && (
          <ol className="flex flex-col gap-2.5">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-2.5 items-start">
                <span className="w-5 h-5 rounded-full bg-amber-400/15 border border-amber-400/30 text-accent text-[11px] font-semibold inline-flex items-center justify-center shrink-0 mt-px">
                  {i + 1}
                </span>
                <span className="text-xs text-ink-muted leading-relaxed">
                  {step}
                </span>
              </li>
            ))}
          </ol>
        )}

        {extensionSupported && (
          <a
            href="https://chromewebstore.google.com/detail/huddle-for-netflix/mmghgnlloogcifdblldihfmjoefabohc"
            target="_blank"
            rel="noopener noreferrer"
            className="h-11 rounded-[var(--radius-control)] border border-accent bg-accent-soft hover:bg-accent-tint text-accent text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors"
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
              <path d="M12 3v12m0 0l4-4m-4 4l-4-4" />
              <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
            </svg>
            Install the Chrome extension
          </a>
        )}

        {androidSupported && roomUrl && (
          <a
            href={roomUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="h-10 rounded-[var(--radius-control)] border border-hairline bg-surface hover:bg-raised text-ink text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors"
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
            Open in the Huddle Android app
          </a>
        )}

        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="h-10 rounded-[var(--radius-control)] border border-hairline bg-surface hover:bg-raised text-ink text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors"
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

        <div className="text-[11px] text-ink-faint leading-relaxed">
          {isNetflix ? (
            <>
              We never proxy or share Netflix accounts &mdash; everyone signs
              into their own, and playback uses the device&rsquo;s native DRM.{" "}
              <a
                href="/netflix"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-ink-muted"
              >
                Why can&rsquo;t I paste a Netflix link?
              </a>
            </>
          ) : isPrime ? (
            "Works with supported Prime Video series. Everyone signs into their own account — we never proxy or share them."
          ) : (
            "The room’s chat, voice, and reactions still work — they just play alongside whatever you’re watching in the other tab."
          )}
        </div>
      </div>
    </div>
  );
}
