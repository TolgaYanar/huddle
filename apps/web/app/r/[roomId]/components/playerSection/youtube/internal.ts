import type React from "react";

import { getYouTubeVideoId } from "../../../lib/video";

export type YouTubeInternalPlayer = {
  // Core playback / switching
  playVideo?: () => void;
  loadVideoById?: (id: string) => void;
  cueVideoById?: (id: string) => void;

  // State / metadata
  getVideoData?: () => unknown;
  getVideoUrl?: () => unknown;
  getPlayerState?: () => unknown;

  // DOM
  getIframe?: () => unknown;

  // Audio
  mute?: () => void;
  unMute?: () => void;
  isMuted?: () => unknown;
  setVolume?: (vol: number) => void;
  getVolume?: () => unknown;

  // Events
  addEventListener?: (evt: string, cb: (e: unknown) => void) => void;
  removeEventListener?: (evt: string, cb: (e: unknown) => void) => void;
};

export function getInternalPlayerFromRef(
  playerRef: React.RefObject<unknown>,
): YouTubeInternalPlayer | null {
  const wrapper = playerRef.current as
    | {
        getInternalPlayer?: () => unknown;
      }
    | null
    | undefined;

  const internal = wrapper?.getInternalPlayer?.() as
    | YouTubeInternalPlayer
    | null
    | undefined;

  return internal ?? null;
}

export function getInternalCurrentVideoId(
  internal: YouTubeInternalPlayer,
): string | null {
  try {
    const data = internal.getVideoData?.() as
      | { video_id?: unknown }
      | null
      | undefined;
    const vid =
      typeof data?.video_id === "string" && data.video_id
        ? data.video_id
        : null;
    if (vid) return vid;

    const url = internal.getVideoUrl?.();
    if (typeof url === "string" && url) return getYouTubeVideoId(url);
  } catch {
    // ignore
  }
  return null;
}

export function isInternalIframeConnected(
  internal: YouTubeInternalPlayer,
): boolean {
  try {
    const iframe = internal.getIframe?.() as
      | { isConnected?: unknown }
      | null
      | undefined;
    if (!iframe) return true;
    if (typeof iframe.isConnected === "boolean") return iframe.isConnected;
  } catch {
    // ignore
  }
  return true;
}
