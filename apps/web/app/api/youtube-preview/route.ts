import { NextResponse } from "next/server";

import { createRouteRateLimiter } from "../_lib/rateLimit";
import { createTtlCache } from "../_lib/ttlCache";
import { upstreamSignal } from "../_lib/upstream";
import { extractYouTubeVideoId } from "../_lib/youtube";

export const runtime = "nodejs";

const limiter = createRouteRateLimiter({ windowMs: 60_000, max: 60 });
const MAX_URL_LENGTH = 2048;

type PreviewOk = {
  ok: true;
  videoId: string;
  title: string;
  thumbnail: string | null;
  durationSeconds: number | null;
};

// A video's title and duration don't change between previews, and the same
// links get pasted repeatedly. Cache successes by id to save quota.
const previewCache = createTtlCache<PreviewOk>({
  max: 1000,
  ttlMs: 6 * 60 * 60_000,
});

function parseIso8601DurationToSeconds(iso: string): number | null {
  // e.g. PT1H2M3S, PT4M, PT50S
  if (!iso || typeof iso !== "string") return null;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  const hours = m[1] ? Number(m[1]) : 0;
  const minutes = m[2] ? Number(m[2]) : 0;
  const seconds = m[3] ? Number(m[3]) : 0;
  if (![hours, minutes, seconds].every((n) => Number.isFinite(n))) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

export async function GET(req: Request) {
  const r = limiter(req);
  if (!r.allowed) return r.response;

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    // No key configured: don't error loudly; client will fall back.
    return NextResponse.json(
      { ok: false, reason: "missing_key" },
      { status: 200 },
    );
  }

  const { searchParams } = new URL(req.url);
  const url = (searchParams.get("url") ?? "").slice(0, MAX_URL_LENGTH);
  const videoId = extractYouTubeVideoId(url);

  if (!videoId) {
    return NextResponse.json(
      { ok: false, reason: "invalid_url" },
      { status: 200 },
    );
  }

  const cached = previewCache.get(videoId);
  if (cached) return NextResponse.json(cached, { status: 200 });

  try {
    const endpoint = new URL("https://www.googleapis.com/youtube/v3/videos");
    endpoint.searchParams.set("part", "snippet,contentDetails");
    endpoint.searchParams.set("id", videoId);
    endpoint.searchParams.set("key", apiKey);

    const res = await fetch(endpoint.toString(), {
      // Best effort: avoid caching quota errors.
      cache: "no-store",
      signal: upstreamSignal(),
    });

    const body = await res.json().catch(() => null);

    if (!res.ok) {
      const reason =
        body?.error?.errors?.[0]?.reason ||
        body?.error?.status ||
        "youtube_api_error";

      // Quota exceeded: explicitly signal but keep it non-fatal.
      if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
        return NextResponse.json(
          { ok: false, reason: "quota" },
          { status: 200 },
        );
      }

      // Google's raw reason (keyInvalid, API_KEY_HTTP_REFERRER_BLOCKED, ...)
      // describes our key's configuration; don't hand it to anonymous callers.
      return NextResponse.json(
        { ok: false, reason: "youtube_api_error" },
        { status: 200 },
      );
    }

    const item = body?.items?.[0];
    if (!item) {
      return NextResponse.json(
        { ok: false, reason: "not_found" },
        { status: 200 },
      );
    }

    const title = item?.snippet?.title ?? "YouTube Video";

    const thumbs = item?.snippet?.thumbnails;
    const thumbnailUrl =
      thumbs?.maxres?.url ||
      thumbs?.standard?.url ||
      thumbs?.high?.url ||
      thumbs?.medium?.url ||
      thumbs?.default?.url ||
      null;

    const durationIso = item?.contentDetails?.duration;
    const durationSeconds =
      typeof durationIso === "string"
        ? parseIso8601DurationToSeconds(durationIso)
        : null;

    const preview: PreviewOk = {
      ok: true,
      videoId,
      title,
      thumbnail: thumbnailUrl,
      durationSeconds,
    };
    previewCache.set(videoId, preview);
    return NextResponse.json(preview, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false, reason: "network" }, { status: 200 });
  }
}
