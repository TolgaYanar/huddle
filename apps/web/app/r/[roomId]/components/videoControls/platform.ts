import type { PlatformCapabilities, PlatformType } from "./types";

export const PLATFORM_CAPABILITIES: Record<PlatformType, PlatformCapabilities> =
  {
    youtube: {
      canPlay: true,
      canPause: true,
      canSeek: true,
      canMute: true,
      canChangeSpeed: true,
      canChangeVolume: true,
      canGetDuration: true,
      canGetCurrentTime: true,
      speedOptions: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
    },
    direct: {
      canPlay: true,
      canPause: true,
      canSeek: true,
      canMute: true,
      canChangeSpeed: true,
      canChangeVolume: true,
      canGetDuration: true,
      canGetCurrentTime: true,
      speedOptions: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3],
    },
    twitch: {
      canPlay: false,
      canPause: false,
      canSeek: false,
      canMute: false,
      canChangeSpeed: false,
      canChangeVolume: false,
      canGetDuration: false,
      canGetCurrentTime: false,
      speedOptions: [],
    },
    kick: {
      canPlay: false,
      canPause: false,
      canSeek: false,
      canMute: false,
      canChangeSpeed: false,
      canChangeVolume: false,
      canGetDuration: false,
      canGetCurrentTime: false,
      speedOptions: [],
    },
    prime: {
      canPlay: false,
      canPause: false,
      canSeek: false,
      canMute: false,
      canChangeSpeed: false,
      canChangeVolume: false,
      canGetDuration: false,
      canGetCurrentTime: false,
      speedOptions: [],
    },
    netflix: {
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
    unknown: {
      canPlay: true,
      canPause: true,
      canSeek: true,
      canMute: true,
      canChangeSpeed: true,
      canChangeVolume: true,
      canGetDuration: true,
      canGetCurrentTime: true,
      speedOptions: [0.5, 0.75, 1, 1.25, 1.5, 2],
    },
  };

export function detectPlatform(url: string): PlatformType {
  if (!url) return "unknown";
  const lower = url.toLowerCase();
  if (lower.includes("netflix.com")) return "netflix";
  if (lower.includes("youtube.com") || lower.includes("youtu.be"))
    return "youtube";
  if (lower.includes("twitch.tv")) return "twitch";
  if (lower.includes("kick.com")) return "kick";
  if (lower.includes("primevideo") || lower.includes("amazon.com/gp/video"))
    return "prime";
  // Check for direct video files
  if (/\.(mp4|webm|ogg|m3u8|mkv|avi|mov)(\?|$)/i.test(url)) return "direct";
  return "unknown";
}
