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

function getCurrentContentId(): string | null {
  return getContentIdFromUrl(location.href);
}

function subscribeToPotentialContentChanges(
  onPotentialChange: () => void,
): () => void {
  const originalPush = history.pushState;
  const originalReplace = history.replaceState;
  const onPopState = () => onPotentialChange();

  history.pushState = (...args: Parameters<typeof history.pushState>) => {
    const result = originalPush.apply(history, args);
    onPotentialChange();
    return result;
  };
  history.replaceState = (...args: Parameters<typeof history.replaceState>) => {
    const result = originalReplace.apply(history, args);
    onPotentialChange();
    return result;
  };
  window.addEventListener("popstate", onPopState);

  return () => {
    history.pushState = originalPush;
    history.replaceState = originalReplace;
    window.removeEventListener("popstate", onPopState);
  };
}

export const netflixAdapter: PlatformAdapter = {
  id: "netflix",
  displayName: "Netflix",
  isPlaybackUrl,
  getPlayer: getBestVideo,
  getContentIdFromUrl,
  getCurrentContentId,
  formatContentId: (contentId) => `/watch/${contentId}`,
  requiresVerifiedContentIdentity: false,
  getMetadata: extractNetflixMetadata,
  seek: safeNetflixSeekViaBackground,
  play: () => safeNetflixSetPlayingViaBackground(true),
  subscribeToPotentialContentChanges,
};
