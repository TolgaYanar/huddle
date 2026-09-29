import { extractNetflixMetadata } from "../metadata";
import {
  safeNetflixSeekViaBackground,
  safeNetflixSetPlayingViaBackground,
} from "../netflixBackground";
import { getBestVideo } from "../video";
import type { PlatformAdapter } from "./types";

const NETFLIX_HOST = "www.netflix.com";

function getContentIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== NETFLIX_HOST) {
      return null;
    }
    return parsed.pathname.match(/^\/watch\/(\d+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

function isPlaybackUrl(url: string): boolean {
  return getContentIdFromUrl(url) !== null;
}

function matchesOrigin(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === NETFLIX_HOST;
  } catch {
    return false;
  }
}

function getCurrentContentId(): string | null {
  return getContentIdFromUrl(location.href);
}

// Content scripts run in an isolated JavaScript world. Netflix's own
// history.pushState calls go through the page's copy, so wrapping `history`
// here only ever saw our own calls — never an in-page navigation such as
// "Next episode". That left the host's episode change unbroadcast while their
// next play/pause carried the old content id back, which pulled the host to
// the previous episode. Watch the URL itself instead; the comparison is a
// string check once a second.
const HREF_POLL_MS = 1000;

function subscribeToPotentialContentChanges(
  onPotentialChange: () => void,
): () => void {
  let lastHref = location.href;
  const check = () => {
    const href = location.href;
    if (href === lastHref) return;
    lastHref = href;
    onPotentialChange();
  };
  const onPopState = () => {
    lastHref = location.href;
    onPotentialChange();
  };

  const timer = setInterval(check, HREF_POLL_MS);
  window.addEventListener("popstate", onPopState);

  return () => {
    clearInterval(timer);
    window.removeEventListener("popstate", onPopState);
  };
}

export const netflixAdapter: PlatformAdapter = {
  id: "netflix",
  displayName: "Netflix",
  matchesOrigin,
  isPlaybackUrl,
  getPlayer: getBestVideo,
  getContentIdFromUrl,
  getCurrentContentId,
  formatContentId: (contentId) => `/watch/${contentId}`,
  getNavigationUrl: (targetUrl) =>
    isPlaybackUrl(targetUrl) ? targetUrl : null,
  requiresVerifiedContentIdentity: false,
  getMetadata: extractNetflixMetadata,
  seek: safeNetflixSeekViaBackground,
  play: () => safeNetflixSetPlayingViaBackground(true),
  subscribeToPotentialContentChanges,
};
