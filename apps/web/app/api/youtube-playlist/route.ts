import { NextResponse } from "next/server";

import { createRouteRateLimiter } from "../_lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Each call may paginate up to 10 times against the YouTube API. 10/min/IP.
const limiter = createRouteRateLimiter({ windowMs: 60_000, max: 10 });
const MAX_URL_LENGTH = 2048;

type YouTubePlaylistItem = {
  videoId: string;
  title: string;
  channelTitle: string | null;
  thumbnail: string | null;
  position: number;
};

type YouTubePlaylistResponse =
  | {
      ok: true;
      playlistTitle: string | null;
      items: YouTubePlaylistItem[];
    }
  | {
      ok: false;
      reason:
        | "missing_key"
        | "missing_playlist_id"
        | "quota"
        | "youtube_api_error"
        | "network"
        | "not_found";
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

// Extract playlist ID from various YouTube playlist URL formats
function extractPlaylistId(url: string): string | null {
  try {
    const urlObj = new URL(url);

    // Check for ?list= parameter (most common)
    const listParam = urlObj.searchParams.get("list");
    if (listParam) return listParam;

    // Check for /playlist?list= format
    if (urlObj.pathname.includes("/playlist")) {
      return urlObj.searchParams.get("list");
    }

    return null;
  } catch {
    // If it's not a URL, check if it's a raw playlist ID
    if (/^[A-Za-z0-9_-]{13,}$/.test(url)) {
      return url;
    }
    return null;
  }
}

export async function GET(req: Request) {
  const r = limiter(req);
  if (!r.allowed) return r.response;

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json<YouTubePlaylistResponse>(
      { ok: false, reason: "missing_key" },
      { status: 200 }
    );
  }

  const { searchParams } = new URL(req.url);
  const urlOrId = (
    searchParams.get("playlistId") ??
    searchParams.get("url") ??
    ""
  )
    .trim()
    .slice(0, MAX_URL_LENGTH);

  if (!urlOrId) {
    return NextResponse.json<YouTubePlaylistResponse>(
      { ok: false, reason: "missing_playlist_id" },
      { status: 200 }
    );
  }

  const playlistId = extractPlaylistId(urlOrId);
  if (!playlistId) {
    return NextResponse.json<YouTubePlaylistResponse>(
      { ok: false, reason: "missing_playlist_id" },
      { status: 200 }
    );
  }

  const maxResultsRaw = searchParams.get("maxResults");
  const maxResults = Math.min(
    50,
    Math.max(1, maxResultsRaw ? Number(maxResultsRaw) : 50)
  );

  try {
    // First, get playlist info
    const playlistEndpoint = new URL(
      "https://www.googleapis.com/youtube/v3/playlists"
    );
    playlistEndpoint.searchParams.set("part", "snippet");
    playlistEndpoint.searchParams.set("id", playlistId);
    playlistEndpoint.searchParams.set("key", apiKey);

    const playlistRes = await fetch(playlistEndpoint.toString(), {
      cache: "no-store",
    });
    const playlistBody: unknown = await playlistRes.json().catch(() => null);

    let playlistTitle: string | null = null;
    if (isRecord(playlistBody)) {
      const items = playlistBody.items;
      if (Array.isArray(items) && items.length > 0) {
        const firstItem = items[0];
        if (isRecord(firstItem) && isRecord(firstItem.snippet)) {
          const title = firstItem.snippet.title;
          if (typeof title === "string") {
            playlistTitle = title;
          }
        }
      }
    }

    // Now get playlist items
    const endpoint = new URL(
      "https://www.googleapis.com/youtube/v3/playlistItems"
    );
    endpoint.searchParams.set("part", "snippet,contentDetails");
    endpoint.searchParams.set("playlistId", playlistId);
    endpoint.searchParams.set("maxResults", String(maxResults));
    endpoint.searchParams.set("key", apiKey);

    const allItems: YouTubePlaylistItem[] = [];
    let nextPageToken: string | null = null;
    let fetchCount = 0;
    const maxFetches = 10; // Limit to 500 videos max

    do {
      if (nextPageToken) {
        endpoint.searchParams.set("pageToken", nextPageToken);
      }

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
        }

        if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
          return NextResponse.json<YouTubePlaylistResponse>(
            { ok: false, reason: "quota" },
            { status: 200 }
          );
        }

        if (reason === "playlistNotFound") {
          return NextResponse.json<YouTubePlaylistResponse>(
            { ok: false, reason: "not_found" },
            { status: 200 }
          );
        }

        return NextResponse.json<YouTubePlaylistResponse>(
          { ok: false, reason: "youtube_api_error" },
          { status: 200 }
        );
      }

      const itemsVal = isRecord(body) ? body.items : null;
      const itemsRaw: unknown[] = Array.isArray(itemsVal) ? itemsVal : [];

      for (const it of itemsRaw) {
        if (!isRecord(it)) continue;

        const contentDetails = isRecord(it.contentDetails)
          ? it.contentDetails
          : null;
        const videoId =
          contentDetails && typeof contentDetails.videoId === "string"
            ? contentDetails.videoId
            : null;

        if (!videoId || videoId.length !== 11) continue;

        const snippet = isRecord(it.snippet) ? it.snippet : null;
        const title =
          snippet && typeof snippet.title === "string"
            ? snippet.title
            : "YouTube Video";
        const channelTitle =
          snippet && typeof snippet.videoOwnerChannelTitle === "string"
            ? snippet.videoOwnerChannelTitle
            : null;
        const position =
          snippet && typeof snippet.position === "number"
            ? snippet.position
            : allItems.length;
        const thumbnails =
          snippet && isRecord(snippet.thumbnails)
            ? (snippet.thumbnails as unknown as YouTubeThumbnails)
            : null;
        const thumbnail = pickThumbnailUrl(thumbnails);

        // Skip deleted/private videos
        if (title === "Deleted video" || title === "Private video") continue;

        allItems.push({ videoId, title, channelTitle, thumbnail, position });
      }

      // Get next page token
      nextPageToken =
        isRecord(body) && typeof body.nextPageToken === "string"
          ? body.nextPageToken
          : null;
      fetchCount++;
    } while (nextPageToken && fetchCount < maxFetches);

    // Sort by position
    allItems.sort((a, b) => a.position - b.position);

    return NextResponse.json<YouTubePlaylistResponse>({
      ok: true,
      playlistTitle,
      items: allItems,
    });
  } catch {
    return NextResponse.json<YouTubePlaylistResponse>(
      { ok: false, reason: "network" },
      { status: 200 }
    );
  }
}
