export function isProblematicYoutubeUrl(rawUrl: string) {
  // These commonly show a black player stuck at 0:00 in embeds.
  // Example: list=RD...&start_radio=1
  return (
    /youtube\.com\/watch\?/.test(rawUrl) &&
    /[?&](list=RD|start_radio=1)/.test(rawUrl)
  );
}

export function normalizeVideoUrl(rawUrl: string) {
  const trimmed = rawUrl.trim();

  // If the user pasted an iframe snippet, extract src="...".
  // Example:
  // <iframe src="https://www.atv.com.tr/canli-yayin" ...></iframe>
  if (trimmed.startsWith("<") && /<iframe\b/i.test(trimmed)) {
    const m = trimmed.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    if (m?.[1]) {
      return normalizeVideoUrl(m[1]);
    }
  }

  // Accept inputs like `kick.com/elwind` / `twitch.tv/shroud` by adding https://
  const withScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)
    ? trimmed
    : /^([\w-]+\.)+[\w-]+(\/|$)/.test(trimmed)
      ? `https://${trimmed}`
      : trimmed;

  // If it's a normal YouTube watch URL, strip playlist/radio params that often break embeds.
  try {
    const url = new URL(withScheme);
    const host = url.hostname.replace(/^www\./, "");
    const isYoutube = host === "youtube.com" || host === "m.youtube.com";
    const isWatch = isYoutube && url.pathname === "/watch";

    if (!isWatch) return withScheme;

    const videoId = url.searchParams.get("v");
    if (!videoId) return withScheme;

    // Preserve the start time parameter if present
    const timeParam =
      url.searchParams.get("t") || url.searchParams.get("start");

    // keep only `v` and optionally `t`
    if (timeParam) {
      return `https://www.youtube.com/watch?v=${videoId}&t=${timeParam}`;
    }
    return `https://www.youtube.com/watch?v=${videoId}`;
  } catch {
    return withScheme;
  }
}

export function getLoadTimeoutMs(rawUrl: string) {
  const normalized = normalizeVideoUrl(rawUrl);
  if (getKickEmbedSrc(normalized)) return 25000;
  if (isTwitchUrl(normalized)) return 25000;
  if (shouldEmbedWebpage(normalized)) return 25000;
  const isFile = /\.(mp4|webm|ogv|ogg|m3u8)(\?|#|$)/i.test(normalized);
  return isFile ? 30000 : 20000;
}

export function getTimeoutErrorMessage(rawUrl: string) {
  const normalized = normalizeVideoUrl(rawUrl);

  if (isPrimeVideoUrl(normalized)) {
    return getPrimeVideoMessage();
  }

  if (getKickEmbedSrc(normalized)) {
    return "Timed out loading this Kick embed. If you use ad/privacy blockers, try disabling them for kick.com, then reload.";
  }

  if (isTwitchUrl(normalized)) {
    return "Timed out loading this Twitch embed. Twitch requires an embed `parent` parameter; if you use ad/privacy blockers, try disabling them for twitch.tv, then reload.";
  }

  if (isProblematicYoutubeUrl(rawUrl)) {
    return "Timed out loading this YouTube embed. Try a different YouTube watch URL (no playlist/radio), or disable ad/privacy extensions that block YouTube embeds.";
  }

  if (shouldEmbedWebpage(normalized)) {
    return "Timed out loading this site inside Huddle. Some sites block embedding in iframes. Try opening it in a new tab, or use a direct stream URL (e.g. .m3u8) if you have one.";
  }

  return "Timed out loading this video. If this is a YouTube link, use a normal watch URL (no playlist/radio). If you use ad/privacy blockers, try disabling them for this site.";
}

export function isYouTubeUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    return (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "youtu.be" ||
      host === "youtube-nocookie.com" ||
      host.endsWith(".youtube-nocookie.com")
    );
  } catch {
    return /youtube\.com|youtu\.be|youtube-nocookie\.com/i.test(rawUrl);
  }
}

export function getYouTubeVideoId(rawUrl: string): string | null {
  const normalized = normalizeVideoUrl(rawUrl);

  try {
    const url = new URL(normalized);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id || null;
    }

    const isYoutubeHost =
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "youtube-nocookie.com" ||
      host.endsWith(".youtube-nocookie.com");
    if (!isYoutubeHost) return null;

    // Standard watch URL: /watch?v=<id>
    if (url.pathname === "/watch") {
      return url.searchParams.get("v") || null;
    }

    // Embed URL: /embed/<id>
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "embed" && parts[1]) return parts[1];
    if (parts[0] === "shorts" && parts[1]) return parts[1];
    if (parts[0] === "live" && parts[1]) return parts[1];

    return null;
  } catch {
    // Fallback for odd inputs.
    const m = normalized.match(/[?&]v=([^&#]+)/);
    if (m?.[1]) return m[1];
    const short = normalized.match(/youtu\.be\/([^?#/]+)/i);
    if (short?.[1]) return short[1];
    return null;
  }
}

/**
 * Extracts the start time (in seconds) from a YouTube URL.
 * Supports both `t=` and `start=` parameters.
 * Examples:
 *   - https://youtu.be/ggn8wnWiw2U?t=2391 → 2391
 *   - https://www.youtube.com/watch?v=xxx&t=1h2m30s → 3750
 *   - https://www.youtube.com/watch?v=xxx&start=60 → 60
 */
export function getYouTubeStartTime(rawUrl: string): number | null {
  try {
    const url = new URL(rawUrl);

    // Check for `t` parameter (common in youtu.be and share links)
    let timeParam = url.searchParams.get("t");
    // Also check for `start` parameter (used in embed URLs)
    if (!timeParam) {
      timeParam = url.searchParams.get("start");
    }

    if (!timeParam) return null;

    // Parse the time parameter
    // It can be:
    // - Pure seconds: "2391"
    // - Time format: "1h2m30s", "2m30s", "30s", "1h30m"
    const parsed = parseYouTubeTime(timeParam);
    return parsed > 0 ? parsed : null;
  } catch {
    // Fallback regex for malformed URLs
    const match = rawUrl.match(/[?&](t|start)=([^&#]+)/i);
    if (match?.[2]) {
      const parsed = parseYouTubeTime(match[2]);
      return parsed > 0 ? parsed : null;
    }
    return null;
  }
}

/**
 * Parses YouTube time format into seconds.
 * Supports: "2391", "1h2m30s", "2m30s", "30s", "1h30m", "1h"
 */
function parseYouTubeTime(timeStr: string): number {
  // If it's a pure number, return it directly
  const pureNum = parseInt(timeStr, 10);
  if (/^\d+$/.test(timeStr) && !isNaN(pureNum)) {
    return pureNum;
  }

  // Parse time format like "1h2m30s"
  let totalSeconds = 0;

  const hoursMatch = timeStr.match(/(\d+)h/i);
  const minutesMatch = timeStr.match(/(\d+)m/i);
  const secondsMatch = timeStr.match(/(\d+)s/i);

  if (hoursMatch?.[1]) {
    totalSeconds += parseInt(hoursMatch[1], 10) * 3600;
  }
  if (minutesMatch?.[1]) {
    totalSeconds += parseInt(minutesMatch[1], 10) * 60;
  }
  if (secondsMatch?.[1]) {
    totalSeconds += parseInt(secondsMatch[1], 10);
  }

  return totalSeconds;
}

/**
 * Formats seconds into a human-readable time string.
 * Examples: 90 → "1:30", 3661 → "1:01:01"
 */
export function formatStartTime(seconds: number): string {
  if (seconds <= 0) return "0:00";

  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function isVimeoUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    return host === "vimeo.com" || host === "player.vimeo.com";
  } catch {
    return /vimeo\.com/i.test(rawUrl);
  }
}

export function isDirectMediaUrl(rawUrl: string) {
  return /\.(mp4|webm|ogv|ogg|m3u8)(\?|#|$)/i.test(rawUrl);
}

export function shouldEmbedWebpage(rawUrl: string) {
  const normalized = normalizeVideoUrl(rawUrl);

  // Only attempt for valid http(s) URLs.
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return false;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  // Known supported sources should use their dedicated players.
  if (isPrimeVideoUrl(normalized)) return false;
  if (isYouTubeUrl(normalized)) return false;
  if (isVimeoUrl(normalized)) return false;
  if (getKickEmbedSrc(normalized)) return false;
  if (isTwitchUrl(normalized)) return false;
  if (isDirectMediaUrl(normalized)) return false;
  if (isNetflixUrl(normalized)) return false;

  // For everything else, try embedding the webpage.
  return true;
}

export function getPrimeVideoMessage() {
  return "Prime Video is DRM-protected and can’t be embedded/controlled inside Huddle. Open it in a new tab/app; Huddle can still sync the link for everyone.";
}

export function isNetflixUrl(rawUrl: string) {
  return rawUrl.toLowerCase().includes("netflix.com");
}

export function isPrimeVideoUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    return host === "primevideo.com" || host.endsWith(".primevideo.com");
  } catch {
    return false;
  }
}

export function isTwitchUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    return host === "twitch.tv" || host === "clips.twitch.tv";
  } catch {
    return false;
  }
}

export function getTwitchEmbedSrc(
  rawUrl: string,
  parent: string
): string | null {
  // Twitch embeds require `parent=<your domain>` or the iframe shows blank.
  // Supports:
  // - https://www.twitch.tv/<channel>
  // - https://www.twitch.tv/videos/<id>
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();

    let channel: string | null = null;
    let videoId: string | null = null;

    if (host === "twitch.tv") {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length === 0) return null;

      if (parts[0] === "videos" && parts[1]) {
        videoId = parts[1];
      } else {
        // channel page
        channel = parts[0] ?? null;
      }
    } else if (host === "clips.twitch.tv") {
      // Clip embeds are different; skip for now.
      return null;
    } else {
      return null;
    }

    const p = parent || "localhost";
    const qs = new URLSearchParams();
    qs.set("parent", p);
    qs.set("autoplay", "false");
    qs.set("muted", "true");

    if (videoId) {
      qs.set("video", videoId);
      return `https://player.twitch.tv/?${qs.toString()}`;
    }

    if (channel) {
      qs.set("channel", channel);
      return `https://player.twitch.tv/?${qs.toString()}`;
    }

    return null;
  } catch {
    return null;
  }
}

export function getKickEmbedSrc(rawUrl: string): string | null {
  // Supports:
  // - https://kick.com/<channel>
  // - https://www.kick.com/<channel>
  // - https://kick.com/video/<id>
  // Uses Kick's player host: https://player.kick.com/...
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== "kick.com") return null;

    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return null;

    if (parts[0] === "video" && parts[1]) {
      return `https://player.kick.com/video/${encodeURIComponent(parts[1])}`;
    }

    // Channel page: /<channel>
    const channel = parts[0];
    if (!channel) return null;
    // Avoid embedding obvious non-channel paths
    if (
      ["categories", "clips", "settings", "terms", "privacy"].includes(channel)
    ) {
      return null;
    }

    return `https://player.kick.com/${encodeURIComponent(channel)}`;
  } catch {
    return null;
  }
}
