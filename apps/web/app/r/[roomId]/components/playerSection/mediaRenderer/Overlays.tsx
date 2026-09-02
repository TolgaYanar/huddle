"use client";

import React from "react";

export function MediaOverlays({
  isKick,
  isTwitch,
  isPrime,
  isNetflix,
  isWebEmbed,
  isBadYoutubeUrl,
  isYouTube,
  ytAudioBlockedInBackground,
  isPageVisible,
  canPlay,
  playerReady,
  playerError,
  isBuffering,
  normalizedUrl,
}: {
  isKick: boolean;
  isTwitch: boolean;
  isPrime: boolean;
  isNetflix: boolean;
  isWebEmbed: boolean;
  isBadYoutubeUrl: boolean;
  isYouTube: boolean;
  ytAudioBlockedInBackground: boolean;
  isPageVisible: boolean;
  canPlay: boolean;
  playerReady: boolean;
  playerError: string | null;
  isBuffering: boolean;
  normalizedUrl: string;
}) {
  return (
    <>
      {(isKick || isTwitch || isPrime || isNetflix || isWebEmbed) && (
        <div className="absolute top-3 left-3 z-10">
          <span className="px-2.5 py-1 rounded-full text-[11px] font-medium border border-hairline bg-sunken text-ink">
            {isKick
              ? "Kick"
              : isTwitch
                ? "Twitch"
                : isPrime
                  ? "Prime Video"
                  : isNetflix
                    ? "Netflix Sync"
                    : "Web embed"}
          </span>
        </div>
      )}

      {isWebEmbed && !isNetflix && (
        <div className="absolute bottom-3 left-3 z-10 max-w-[75%] rounded-[var(--radius-panel)] border border-hairline bg-sunken backdrop-blur-md px-3 py-2">
          <div className="text-xs text-ink">
            This is an embedded website. Huddle can sync the link, but
            can&apos;t sync play/pause/seek for most sites.
          </div>
          <div className="mt-1">
            <a
              href={normalizedUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs underline underline-offset-4 text-ink"
            >
              Open site in new tab
            </a>
          </div>
        </div>
      )}

      {isPrime && (
        <div className="absolute inset-0 flex items-center justify-center text-center px-6 text-white bg-sunken">
          <div>
            <div className="font-semibold">
              Prime Video can&apos;t be embedded
            </div>
            <div className="text-sm text-ink-muted mt-1">
              Prime Video is DRM-protected, so it won&apos;t play inside Huddle.
              Open it in a new tab and we can still sync the link.
            </div>
            <div className="text-xs text-ink-muted mt-3 break-all">
              URL: {normalizedUrl}
            </div>
            <div className="mt-3">
              <a
                href={normalizedUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs underline underline-offset-4 text-ink"
              >
                Open Prime Video in new tab
              </a>
            </div>
          </div>
        </div>
      )}

      {isBadYoutubeUrl && (
        <div className="absolute inset-0 flex items-center justify-center text-center px-6 text-white bg-sunken">
          <div>
            <div className="font-semibold">
              This YouTube link won&apos;t embed
            </div>
            <div className="text-sm text-ink-muted mt-1">
              &quot;Radio / playlist&quot; links often load forever at 0:00.
            </div>
            <div className="text-sm text-ink-muted mt-3">
              Use a normal watch URL like:
              <div className="font-mono text-xs mt-1 break-all">
                https://www.youtube.com/watch?v=jNQXAC9IVRw
              </div>
            </div>
          </div>
        </div>
      )}

      {canPlay && !playerReady && !playerError && !isNetflix && (
        <div className="absolute inset-0 flex items-center justify-center text-ink-muted bg-sunken">
          {isBuffering ? "Buffering…" : "Loading video…"}
        </div>
      )}

      {isYouTube && ytAudioBlockedInBackground && !isPageVisible && (
        <div className="absolute bottom-3 right-3 z-10 max-w-[75%] rounded-[var(--radius-panel)] border border-hairline bg-sunken backdrop-blur-md px-3 py-2">
          <div className="text-xs text-ink">
            Audio may be blocked in background by your browser. Return to the
            tab (or click Play) to re-enable sound.
          </div>
        </div>
      )}

      {playerError && (
        <div className="absolute inset-0 flex items-center justify-center text-center px-6 text-white bg-sunken">
          <div>
            <div className="font-semibold">Player error</div>
            <div className="text-sm text-ink-muted mt-1 wrap-break-word">
              {playerError}
            </div>
            <div className="text-xs text-ink-muted mt-3 break-all">
              URL: {normalizedUrl}
            </div>
            <div className="mt-3">
              <a
                href={normalizedUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs underline underline-offset-4 text-ink"
              >
                Open URL in new tab
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
