import { NextResponse } from "next/server";

export const runtime = "nodejs";

function extractYouTubeVideoId(inputUrl: string): string | null {
  const url = inputUrl.trim();
  if (!url) return null;

  // Supports:
  // - https://www.youtube.com/watch?v=VIDEOID
  // - https://youtu.be/VIDEOID
  // - https://www.youtube.com/embed/VIDEOID
  // - https://www.youtube.com/shorts/VIDEOID
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];

  for (const re of patterns) {
    const m = url.match(re);
    const id = m?.[1];
    if (id) return id;
  }
  return null;
}

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
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    // No key configured: don't error loudly; client will fall back.
    return NextResponse.json({ ok: false, reason: "missing_key" }, { status: 200 });
  }

  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url") ?? "";
  const videoId = extractYouTubeVideoId(url);

  if (!videoId) {
    return NextResponse.json({ ok: false, reason: "invalid_url" }, { status: 200 });
  }

  try {
    const endpoint = new URL("https://www.googleapis.com/youtube/v3/videos");
    endpoint.searchParams.set("part", "snippet,contentDetails");
    endpoint.searchParams.set("id", videoId);
    endpoint.searchParams.set("key", apiKey);

    const res = await fetch(endpoint.toString(), {
      // Best effort: avoid caching quota errors.
      cache: "no-store",
    });

    const body = await res.json().catch(() => null);

    if (!res.ok) {
      const reason =
        body?.error?.errors?.[0]?.reason ||
        body?.error?.status ||
        "youtube_api_error";

      // Quota exceeded: explicitly signal but keep it non-fatal.
      if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
        return NextResponse.json({ ok: false, reason: "quota" }, { status: 200 });
      }

      return NextResponse.json({ ok: false, reason }, { status: 200 });
    }

    const item = body?.items?.[0];
    if (!item) {
      return NextResponse.json({ ok: false, reason: "not_found" }, { status: 200 });
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

    return NextResponse.json(
      {
        ok: true,
        videoId,
        title,
        thumbnail: thumbnailUrl,
        durationSeconds,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ ok: false, reason: "network" }, { status: 200 });
  }
}
