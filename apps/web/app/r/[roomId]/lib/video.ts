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
  const isFile = /\.(mp4|webm|ogv|ogg)(\?|#|$)/i.test(normalized);
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

  return "Timed out loading this video. If this is a YouTube link, use a normal watch URL (no playlist/radio). If you use ad/privacy blockers, try disabling them for this site.";
}

export function getPrimeVideoMessage() {
  return "Prime Video is DRM-protected and can’t be embedded/controlled inside Huddle. Open it in a new tab/app; Huddle can still sync the link for everyone.";
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
