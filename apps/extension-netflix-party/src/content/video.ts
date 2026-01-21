import type { RoomState } from "./types";

export function getVideoCandidates(): HTMLVideoElement[] {
  return Array.from(document.querySelectorAll("video")).filter(
    (v): v is HTMLVideoElement => v instanceof HTMLVideoElement,
  );
}

function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (Number.parseFloat(style.opacity || "1") < 0.05) return false;
  return true;
}

export function getBestVideo(): HTMLVideoElement | null {
  const vids = getVideoCandidates();
  if (vids.length === 0) return null;

  let best: HTMLVideoElement | null = null;
  let bestScore = -1;

  for (const v of vids) {
    if (!isVisible(v)) continue;
    const rect = v.getBoundingClientRect();
    const area = rect.width * rect.height;
    const readyBonus = v.readyState >= 2 ? 1_000_000 : 0;
    const score = area + readyBonus;
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }

  return best || vids[0];
}

export function getNetflixWatchIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/^\/watch\/(\d+)/);
    return m?.[1] ? m[1] : null;
  } catch {
    const m = String(url).match(/\/watch\/(\d+)/);
    return m?.[1] ? m[1] : null;
  }
}

export function getLocalWatchId(): string | null {
  const m = location.pathname.match(/^\/watch\/(\d+)/);
  return m?.[1] ? m[1] : null;
}

export function computeDesiredTimestampNow(state: RoomState): number | null {
  const base =
    typeof state.timestamp === "number" && Number.isFinite(state.timestamp)
      ? state.timestamp
      : null;
  if (base === null) return null;

  const serverNow =
    typeof state.serverNow === "number" && Number.isFinite(state.serverNow)
      ? state.serverNow
      : null;
  const isPlaying = state.isPlaying === true;
  if (!isPlaying || serverNow === null) return base;

  const speed =
    typeof state.playbackSpeed === "number" &&
    Number.isFinite(state.playbackSpeed)
      ? state.playbackSpeed
      : 1;
  const clientNow = Date.now();
  const deltaSeconds = Math.max(0, (clientNow - serverNow) / 1000);
  return base + deltaSeconds * speed;
}
