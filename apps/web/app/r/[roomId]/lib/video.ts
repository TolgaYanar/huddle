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

    // keep only `v`
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
