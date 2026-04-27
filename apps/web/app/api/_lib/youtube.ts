/**
 * Server-side YouTube URL helpers.
 *
 * Stricter than the room-side utilities in `apps/web/app/r/[roomId]/lib/video.ts`:
 * the API routes pass video IDs straight to Google's API, so we validate the
 * 11-char alphanumeric shape before doing so.
 */

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function isValidVideoId(id: string | null | undefined): id is string {
  return typeof id === "string" && VIDEO_ID_RE.test(id);
}

/**
 * Extracts a valid 11-char YouTube video ID from a URL or returns null.
 * Handles: youtu.be, youtube.com/watch, /embed, /v, /shorts, /live, /watch?v=
 * (and the youtube-nocookie variant).
 */
export function extractYouTubeVideoId(rawUrl: string): string | null {
  const url = (rawUrl || "").trim();
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "youtu.be") {
    const id = parsed.pathname.split("/").filter(Boolean)[0] ?? null;
    return isValidVideoId(id) ? id : null;
  }

  const isYoutubeHost =
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtube-nocookie.com" ||
    host.endsWith(".youtube-nocookie.com");
  if (!isYoutubeHost) return null;

  if (parsed.pathname === "/watch") {
    const v = parsed.searchParams.get("v");
    return isValidVideoId(v) ? v : null;
  }

  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length >= 2) {
    const head = parts[0];
    const id = parts[1];
    if (
      head &&
      (head === "embed" || head === "v" || head === "shorts" || head === "live")
    ) {
      return isValidVideoId(id) ? id : null;
    }
  }

  return null;
}
