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

export function isNetflixWatchUrl(url: string): boolean {
  return /^https:\/\/www\.netflix\.com\/watch\//i.test(url);
}

export function computeDesiredTimestampNow(
  state: RoomState,
  receivedAtMs: number,
): number | null {
  const base =
    typeof state.timestamp === "number" && Number.isFinite(state.timestamp)
      ? state.timestamp
      : null;
  if (base === null) return null;

  const isPlaying = state.isPlaying === true;
  if (!isPlaying) return base;

  const speed =
    typeof state.playbackSpeed === "number" &&
    Number.isFinite(state.playbackSpeed)
      ? state.playbackSpeed
      : 1;
  // Anchor extrapolation at the instant we RECEIVED the snapshot (client
  // clock on both sides of the subtraction). Using serverNow here folded the
  // client's absolute clock skew into the result, so skew > 1s tripped the
  // drift > 1.0 check and hard-seeked Netflix on every event. Apply happens
  // synchronously with receipt, so elapsed ~= 0 and the gross-skew seek is
  // gone, while ongoing playback still extrapolates between events.
  const elapsedSeconds = Math.max(0, (Date.now() - receivedAtMs) / 1000);
  return base + elapsedSeconds * speed;
}
