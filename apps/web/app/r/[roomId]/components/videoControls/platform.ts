import type { PlatformCapabilities, PlatformType } from "./types";

// Re-exported so other modules can `import { PlatformType } from ".../platform"`
// without having to know the type lives in ./types.
export type { PlatformType } from "./types";

// Reusable shapes — keeps the table below readable.
const FULL: PlatformCapabilities = {
  canPlay: true,
  canPause: true,
  canSeek: true,
  canMute: true,
  canChangeSpeed: true,
  canChangeVolume: true,
  canGetDuration: true,
  canGetCurrentTime: true,
  speedOptions: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
};
const FULL_WIDE: PlatformCapabilities = {
  ...FULL,
  speedOptions: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3],
};
const NONE: PlatformCapabilities = {
  canPlay: false,
  canPause: false,
  canSeek: false,
  canMute: false,
  canChangeSpeed: false,
  canChangeVolume: false,
  canGetDuration: false,
  canGetCurrentTime: false,
  speedOptions: [],
};
const PLAY_PAUSE_ONLY: PlatformCapabilities = {
  canPlay: true,
  canPause: true,
  canSeek: true,
  canMute: true,
  canChangeSpeed: false,
  canChangeVolume: true,
  canGetDuration: true,
  canGetCurrentTime: true,
  speedOptions: [],
};

export const PLATFORM_CAPABILITIES: Record<PlatformType, PlatformCapabilities> =
  {
    // Tier 1 — full programmatic control via react-player or our own iframe SDKs.
    youtube: FULL,
    direct: FULL_WIDE,
    hls: FULL_WIDE,
    dash: FULL_WIDE,
    vimeo: FULL,
    dailymotion: FULL,
    wistia: FULL,
    soundcloud: { ...PLAY_PAUSE_ONLY, canChangeSpeed: false },
    peertube: FULL,

    // Tier 2 — we can embed but not control playback remotely.
    twitch: NONE,
    kick: NONE,
    tiktok: NONE,
    spotify: NONE,
    loom: NONE,

    // Tier 3 — DRM-protected, cannot be embedded inline. The web player will
    // surface an "install extension" CTA for these instead of trying to play.
    prime: NONE,
    netflix: {
      // Netflix has the manual-sync popup fallback that we do drive a bit.
      canPlay: true,
      canPause: true,
      canSeek: true,
      canMute: true,
      canChangeSpeed: true,
      canChangeVolume: true,
      canGetDuration: true,
      canGetCurrentTime: true,
      speedOptions: [0.5, 0.75, 1, 1.25, 1.5],
    },
    disney_plus: NONE,
    hbo: NONE,
    hulu: NONE,
    apple_tv_plus: NONE,
    paramount_plus: NONE,
    peacock: NONE,

    unknown: {
      ...FULL,
      speedOptions: [0.5, 0.75, 1, 1.25, 1.5, 2],
    },
  };

/**
 * URL → PlatformType. Order matters when patterns overlap (e.g. a m3u8 file
 * URL that happens to live under youtube.com — youtube wins). Most-specific
 * matches first.
 */
export function detectPlatform(url: string): PlatformType {
  if (!url) return "unknown";
  const lower = url.toLowerCase();

  // Tier 3 — DRM, cannot embed. These need to be checked before any direct-
  // file regex so that e.g. an .m3u8 manifest URL hosted on netflix.com still
  // routes to the Netflix CTA.
  if (lower.includes("netflix.com")) return "netflix";
  if (lower.includes("primevideo") || lower.includes("amazon.com/gp/video"))
    return "prime";
  if (lower.includes("disneyplus.com")) return "disney_plus";
  if (
    lower.includes("hbomax.com") ||
    lower.includes("max.com") ||
    lower.includes("play.hbomax.com")
  )
    return "hbo";
  if (lower.includes("hulu.com")) return "hulu";
  if (lower.includes("tv.apple.com")) return "apple_tv_plus";
  if (lower.includes("paramountplus.com")) return "paramount_plus";
  if (lower.includes("peacocktv.com")) return "peacock";

  // Tier 1 / 2 — embed-friendly platforms.
  if (lower.includes("youtube.com") || lower.includes("youtu.be"))
    return "youtube";
  if (lower.includes("vimeo.com")) return "vimeo";
  if (
    lower.includes("dailymotion.com") ||
    lower.includes("dai.ly") ||
    lower.includes("geo.dailymotion.com")
  )
    return "dailymotion";
  if (lower.includes("wistia.com") || lower.includes("wi.st"))
    return "wistia";
  if (lower.includes("soundcloud.com")) return "soundcloud";
  if (lower.includes("open.spotify.com") || lower.includes("spotify.com"))
    return "spotify";
  if (lower.includes("tiktok.com")) return "tiktok";
  if (lower.includes("loom.com")) return "loom";
  // PeerTube has no central host; the embed lives at /videos/embed/<uuid>.
  // The best heuristic is the embed path itself.
  if (/\/videos\/(?:watch|embed)\/[0-9a-f-]{36,}/i.test(url)) return "peertube";

  if (lower.includes("twitch.tv")) return "twitch";
  if (lower.includes("kick.com")) return "kick";

  // Streaming manifests get their own buckets so the UI can label them
  // distinctly even though react-player's HLS / DASH adapters drive playback.
  if (/\.m3u8(\?|$|#)/i.test(url)) return "hls";
  if (/\.mpd(\?|$|#)/i.test(url)) return "dash";

  // Direct file URLs.
  if (/\.(mp4|webm|ogg|ogv|mkv|avi|mov|m4v|m4a|mp3|wav|aac|flac)(\?|$|#)/i.test(url))
    return "direct";

  return "unknown";
}

/**
 * True for any source we cannot embed inline because of DRM and X-Frame-
 * Options. Drives the "install the Huddle extension" CTA in the player.
 */
export const TIER_3_PLATFORMS: ReadonlyArray<PlatformType> = [
  "netflix",
  "prime",
  "disney_plus",
  "hbo",
  "hulu",
  "apple_tv_plus",
  "paramount_plus",
  "peacock",
];

export function isTier3Platform(p: PlatformType): boolean {
  return TIER_3_PLATFORMS.includes(p);
}

/** Human-friendly label for tooltips, error messages, and the CTA card. */
export function platformDisplayName(p: PlatformType): string {
  switch (p) {
    case "youtube":
      return "YouTube";
    case "vimeo":
      return "Vimeo";
    case "dailymotion":
      return "Dailymotion";
    case "wistia":
      return "Wistia";
    case "soundcloud":
      return "SoundCloud";
    case "spotify":
      return "Spotify";
    case "tiktok":
      return "TikTok";
    case "loom":
      return "Loom";
    case "peertube":
      return "PeerTube";
    case "twitch":
      return "Twitch";
    case "kick":
      return "Kick";
    case "hls":
      return "HLS stream";
    case "dash":
      return "DASH stream";
    case "direct":
      return "Direct video";
    case "netflix":
      return "Netflix";
    case "prime":
      return "Prime Video";
    case "disney_plus":
      return "Disney+";
    case "hbo":
      return "HBO Max";
    case "hulu":
      return "Hulu";
    case "apple_tv_plus":
      return "Apple TV+";
    case "paramount_plus":
      return "Paramount+";
    case "peacock":
      return "Peacock";
    case "unknown":
      return "this source";
  }
}
