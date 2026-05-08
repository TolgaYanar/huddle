/**
 * URL → embed src builders for the platforms we support beyond YouTube /
 * Twitch / Kick. Each returns a fully-qualified iframe URL or null when the
 * input doesn't match the platform. Callers use the null result to gate
 * which renderer to mount.
 */

/** vimeo.com/<id> | vimeo.com/showcase/<n>/video/<id> | player.vimeo.com/video/<id> */
export function getVimeoEmbedSrc(rawUrl: string): string | null {
  if (!rawUrl) return null;
  const lower = rawUrl.toLowerCase();
  if (!lower.includes("vimeo.com")) return null;

  // Already an embed URL — use as-is.
  if (lower.includes("player.vimeo.com/video/")) return rawUrl;

  const idMatch =
    rawUrl.match(/vimeo\.com\/(?:video\/)?(\d+)/i) ||
    rawUrl.match(/vimeo\.com\/showcase\/\d+\/video\/(\d+)/i);
  const id = idMatch?.[1];
  if (!id) return null;
  // `api=1` opts the iframe into the postMessage Player API; controlled by
  // `@vimeo/player` which we wrap in our own embed component.
  return `https://player.vimeo.com/video/${id}?api=1&controls=1&dnt=1`;
}

/**
 * Dailymotion. Supports:
 *   - dailymotion.com/video/<id>
 *   - dai.ly/<id>
 *   - geo.dailymotion.com/player.html?video=<id>
 */
export function getDailymotionEmbedSrc(rawUrl: string): string | null {
  if (!rawUrl) return null;
  const lower = rawUrl.toLowerCase();
  if (
    !lower.includes("dailymotion.com") &&
    !lower.includes("dai.ly")
  )
    return null;

  // Already a player URL.
  if (lower.includes("geo.dailymotion.com/player")) return rawUrl;

  const idMatch =
    rawUrl.match(/dailymotion\.com\/video\/([a-z0-9]+)/i) ||
    rawUrl.match(/dai\.ly\/([a-z0-9]+)/i);
  const id = idMatch?.[1];
  if (!id) return null;

  // `api=postMessage` exposes the Player API events we need for sync.
  return `https://geo.dailymotion.com/player.html?video=${id}&api=postMessage`;
}

/**
 * SoundCloud. Audio only — uses the Widget iframe with the Widget JS API.
 * Accepts artist/track URLs and the `/playlists/<id>` form.
 */
export function getSoundCloudEmbedSrc(rawUrl: string): string | null {
  if (!rawUrl) return null;
  if (!/soundcloud\.com/i.test(rawUrl)) return null;

  // Already a widget URL — leave it alone.
  if (rawUrl.includes("w.soundcloud.com/player/")) return rawUrl;

  const params = new URLSearchParams({
    url: rawUrl,
    auto_play: "false",
    show_comments: "false",
    show_user: "true",
    show_reposts: "false",
    show_teaser: "false",
    visual: "true",
  });
  return `https://w.soundcloud.com/player/?${params.toString()}`;
}

/** loom.com/share/<uuid> — only public shares can be embedded. */
export function getLoomEmbedSrc(rawUrl: string): string | null {
  if (!rawUrl) return null;
  const m = rawUrl.match(/loom\.com\/share\/([0-9a-f]+)/i);
  const id = m?.[1];
  if (!id) return null;
  return `https://www.loom.com/embed/${id}`;
}

/**
 * PeerTube has no central host; the embed lives at /videos/embed/<uuid> on
 * each instance. Accepts both the watch URL and the embed URL.
 */
export function getPeerTubeEmbedSrc(rawUrl: string): string | null {
  if (!rawUrl) return null;
  const watchMatch = rawUrl.match(
    /^(https?:\/\/[^/]+)\/videos\/(?:watch|embed)\/([0-9a-f-]{36,})/i,
  );
  if (!watchMatch) return null;
  const origin = watchMatch[1];
  const id = watchMatch[2];
  // `api=1` enables the postMessage API; required for play/pause/seek sync.
  return `${origin}/videos/embed/${id}?api=1&warningTitle=0`;
}
