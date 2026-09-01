import { getBestVideo } from "../video";
import type {
  PlatformAdapter,
  PlatformCommandResult,
  PlatformMetadata,
} from "./types";

const PRIME_HOST = "www.primevideo.com";
const EPISODE_INFO_SELECTOR = ".atvwebplayersdk-episode-info";

function parsePrimeUrl(url: string): URL | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === PRIME_HOST
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function matchesOrigin(url: string): boolean {
  return parsePrimeUrl(url) !== null;
}

function getContentIdFromUrl(url: string): string | null {
  const parsed = parsePrimeUrl(url);
  if (!parsed) return null;
  const match = parsed.pathname.match(/\/detail\/([A-Z0-9]+)/i);
  return match?.[1] ? `prime:url:${match[1].toUpperCase()}` : null;
}

function isPlaybackUrl(url: string): boolean {
  return getContentIdFromUrl(url) !== null;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function parsePrimeEpisodeIdentity(
  episodeInfo: string | null | undefined,
  pageTitle: string | null | undefined,
): string | null {
  const info = normalizeText(episodeInfo ?? "");
  if (!info) return null;

  const short = info.match(/\bS\s*(\d{1,3})\s*E\s*(\d{1,4})\b/i);
  const turkish = info.match(/\bSezon\s*(\d{1,3})\s*Bölüm\s*(\d{1,4})\b/i);
  const match = short ?? turkish;
  if (!match?.[1] || !match[2]) return null;

  const tail = normalizeText(info.slice((match.index ?? 0) + match[0].length));
  const seriesFromInfo = tail.includes(":")
    ? normalizeText(tail.slice(0, tail.indexOf(":")))
    : "";
  const cleanPageTitle = normalizeText(pageTitle ?? "")
    .replace(/\s*[-|–—]\s*Prime Video\s*$/i, "")
    .trim();
  const series = seriesFromInfo || cleanPageTitle;
  if (!series) return null;

  const seriesFingerprint = fnv1a(series.toLocaleLowerCase("en-US"));
  return `prime:s${Number(match[1])}:e${Number(match[2])}:${seriesFingerprint}`;
}

function readEpisodeInfo(): string | null {
  try {
    return (
      document.querySelector<HTMLElement>(EPISODE_INFO_SELECTOR)?.textContent ??
      null
    );
  } catch {
    return null;
  }
}

function getCurrentContentId(): string | null {
  return parsePrimeEpisodeIdentity(readEpisodeInfo(), document.title);
}

function getMetadata(): PlatformMetadata {
  const episode = normalizeText(readEpisodeInfo() ?? "") || null;
  const title = normalizeText(document.title)
    .replace(/\s*[-|–—]\s*Prime Video\s*$/i, "")
    .trim();
  const posterUrl = (() => {
    try {
      const value = document
        .querySelector<HTMLMetaElement>('meta[property="og:image"]')
        ?.content?.trim();
      return value && /^https?:\/\//i.test(value) ? value : null;
    } catch {
      return null;
    }
  })();
  return { title: title || null, posterUrl, episode };
}

async function seek(seconds: number): Promise<PlatformCommandResult> {
  const player = getBestVideo();
  if (!player) return { ok: false, error: "no_player" };
  if (!Number.isFinite(seconds) || seconds < 0) {
    return { ok: false, error: "invalid_seconds" };
  }
  try {
    player.currentTime = seconds;
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String((error as Error)?.message || error) };
  }
}

async function play(): Promise<PlatformCommandResult> {
  const player = getBestVideo();
  if (!player) return { ok: false, error: "no_player" };
  try {
    await player.play();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String((error as Error)?.message || error) };
  }
}

function subscribeToPotentialContentChanges(
  onPotentialChange: () => void,
): () => void {
  let player: HTMLVideoElement | null = null;
  let lastIdentity = getCurrentContentId();
  let debounceTimer: number | null = null;
  const retryTimers = new Set<number>();

  const checkIdentity = () => {
    debounceTimer = null;
    bindPlayer();
    const nextIdentity = getCurrentContentId();
    if (nextIdentity === lastIdentity) return;
    lastIdentity = nextIdentity;
    onPotentialChange();
  };

  const scheduleCheck = (delay = 50) => {
    if (debounceTimer !== null) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(checkIdentity, delay);
  };

  const onPlayerMetadata = () => {
    scheduleCheck(0);
    for (const delay of [250, 1000]) {
      const timer = window.setTimeout(() => {
        retryTimers.delete(timer);
        checkIdentity();
      }, delay);
      retryTimers.add(timer);
    }
  };

  function bindPlayer() {
    const nextPlayer = getBestVideo();
    if (nextPlayer === player) return;
    player?.removeEventListener("durationchange", onPlayerMetadata);
    player?.removeEventListener("loadedmetadata", onPlayerMetadata);
    player = nextPlayer;
    player?.addEventListener("durationchange", onPlayerMetadata);
    player?.addEventListener("loadedmetadata", onPlayerMetadata);
  }

  bindPlayer();
  const observer = new MutationObserver(() => scheduleCheck());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  return () => {
    observer.disconnect();
    player?.removeEventListener("durationchange", onPlayerMetadata);
    player?.removeEventListener("loadedmetadata", onPlayerMetadata);
    if (debounceTimer !== null) window.clearTimeout(debounceTimer);
    for (const timer of retryTimers) window.clearTimeout(timer);
    retryTimers.clear();
  };
}

export const primeAdapter: PlatformAdapter = {
  id: "prime",
  displayName: "Prime Video",
  matchesOrigin,
  isPlaybackUrl,
  getPlayer: getBestVideo,
  getContentIdFromUrl,
  getCurrentContentId,
  formatContentId: (contentId) => {
    const match = contentId.match(/^prime:s(\d+):e(\d+):/);
    return match ? `S${match[1]} E${match[2]}` : "the room's Prime title";
  },
  // Prime's URL can remain on episode 1 while the player is showing episode
  // 2, so there is no safe URL to auto-follow after an in-player transition.
  getNavigationUrl: () => null,
  requiresVerifiedContentIdentity: true,
  getMetadata,
  seek,
  play,
  subscribeToPotentialContentChanges,
};
