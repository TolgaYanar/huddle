import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type YouTubeSearchResponse =
  | {
      ok: true;
      items: YouTubeSearchItem[];
    }
  | {
      ok: false;
      reason:
        | "missing_key"
        | "missing_query"
        | "quota"
        | "youtube_api_error"
        | "network";
    };

type YouTubeSearchItem = {
  videoId: string;
  title: string;
  channelTitle: string | null;
  thumbnail: string | null;
};

type YouTubeThumbKey = "default" | "medium" | "high" | "standard" | "maxres";

type YouTubeThumbnails = Partial<
  Record<YouTubeThumbKey, { url?: string | null }>
>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function pickThumbnailUrl(
  thumbs: YouTubeThumbnails | null | undefined
): string | null {
  return (
    thumbs?.maxres?.url ||
    thumbs?.standard?.url ||
    thumbs?.high?.url ||
    thumbs?.medium?.url ||
    thumbs?.default?.url ||
    null
  );
}

function normalizeCountryCode(v: string | null): string | null {
  if (!v) return null;
  const cc = v.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(cc) ? cc : null;
}

function parsePrimaryLanguage(acceptLanguage: string | null): string | null {
  // Example: "en-AU,en;q=0.9" -> "en"
  if (!acceptLanguage) return null;
  const first = acceptLanguage.split(",")[0]?.trim();
  if (!first) return null;
  const lang = first.split(";")[0]?.trim().split("-")[0]?.trim();
  if (!lang) return null;
  return /^[a-zA-Z]{2,3}$/.test(lang) ? lang.toLowerCase() : null;
}

export async function GET(req: Request) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json<YouTubeSearchResponse>(
      { ok: false, reason: "missing_key" },
      { status: 200 }
    );
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();

  if (!q) {
    return NextResponse.json<YouTubeSearchResponse>(
      { ok: false, reason: "missing_query" },
      { status: 200 }
    );
  }

  const maxResultsRaw = searchParams.get("maxResults");
  const maxResults = Math.min(
    25,
    Math.max(1, maxResultsRaw ? Number(maxResultsRaw) : 12)
  );

  try {
    const endpoint = new URL("https://www.googleapis.com/youtube/v3/search");
    endpoint.searchParams.set("part", "snippet");
    endpoint.searchParams.set("type", "video");
    endpoint.searchParams.set("q", q);
    endpoint.searchParams.set("maxResults", String(maxResults));
    endpoint.searchParams.set("safeSearch", "moderate");
    endpoint.searchParams.set("videoEmbeddable", "true");

    // Regional relevance: API key is NOT region-locked, but search ranking can vary.
    // When deployed on Vercel, x-vercel-ip-country is commonly available.
    const country = normalizeCountryCode(
      req.headers.get("x-vercel-ip-country")
    );
    if (country) endpoint.searchParams.set("regionCode", country);

    const lang = parsePrimaryLanguage(req.headers.get("accept-language"));
    if (lang) endpoint.searchParams.set("relevanceLanguage", lang);

    endpoint.searchParams.set("key", apiKey);

    const res = await fetch(endpoint.toString(), { cache: "no-store" });
    const body: unknown = await res.json().catch(() => null);

    if (!res.ok) {
      let reason = "youtube_api_error";
      if (isRecord(body) && isRecord(body.error)) {
        const err = body.error;
        const errorsVal = err.errors;
        if (Array.isArray(errorsVal) && errorsVal.length > 0) {
          const first = errorsVal[0];
          if (isRecord(first) && typeof first.reason === "string") {
            reason = first.reason;
          }
        }

        if (reason === "youtube_api_error" && typeof err.status === "string") {
          reason = err.status;
        }
      }

      if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
        return NextResponse.json<YouTubeSearchResponse>(
          { ok: false, reason: "quota" },
          { status: 200 }
        );
      }

      return NextResponse.json<YouTubeSearchResponse>(
        { ok: false, reason: "youtube_api_error" },
        { status: 200 }
      );
    }

    const itemsVal = isRecord(body) ? body.items : null;
    const itemsRaw: unknown[] = Array.isArray(itemsVal) ? itemsVal : [];

    const items: YouTubeSearchItem[] = [];
    for (const it of itemsRaw) {
      if (!isRecord(it)) continue;

      const id = isRecord(it.id) ? it.id : null;
      const videoId = isRecord(id) ? id.videoId : null;
      if (typeof videoId !== "string" || videoId.length !== 11) continue;

      const snippet = isRecord(it.snippet) ? it.snippet : null;
      const title =
        snippet && typeof snippet.title === "string"
          ? snippet.title
          : "YouTube Video";
      const channelTitle =
        snippet && typeof snippet.channelTitle === "string"
          ? snippet.channelTitle
          : null;
      const thumbnails =
        snippet && isRecord(snippet.thumbnails)
          ? (snippet.thumbnails as unknown as YouTubeThumbnails)
          : null;
      const thumbnail = pickThumbnailUrl(thumbnails);

      items.push({ videoId, title, channelTitle, thumbnail });
    }

    return NextResponse.json<YouTubeSearchResponse>({ ok: true, items });
  } catch {
    return NextResponse.json<YouTubeSearchResponse>(
      { ok: false, reason: "network" },
      { status: 200 }
    );
  }
}
