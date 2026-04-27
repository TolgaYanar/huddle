import { type NextRequest, NextResponse } from "next/server";

import { createRouteRateLimiter } from "../_lib/rateLimit";

/**
 * Free image search aimed at "find the canonical picture of a known thing":
 * brand logos, famous places, well-known people. Two complementary sources,
 * combined and deduped:
 *
 *   1. **Wikipedia REST API** — the lead image of the matching article.
 *      Reliable for proper nouns. "hyundai" → Hyundai logo,
 *      "eiffel tower" → the famous photo, "michael jordan" → portrait.
 *      Uses opensearch to disambiguate before fetching the summary.
 *   2. **Wikimedia Commons** — file-based search, useful for media that
 *      isn't featured on a specific Wikipedia page (alternative angles,
 *      historical photos, art).
 *
 * Both are free, no auth, no rate-limit issues for normal usage. We pull
 * a handful from each and let the client pick.
 *
 * For purely creative prompts ("red dragon eating ice cream") clients
 * should use /api/image-generate instead — that hits an AI model. This
 * route is for "real things".
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|svg)$/i;
const MAX_QUERY_LENGTH = 200;
const limiter = createRouteRateLimiter({ windowMs: 60_000, max: 60 });

const FETCH_HEADERS = {
  // Wikipedia/Wikimedia request a real UA per their guidelines.
  "user-agent": "wehuddle/1.0 (https://wehuddle.tv) — image search",
  accept: "application/json",
};

interface ImageHit {
  url: string;
  thumbnail: string;
  title: string;
  source: "wikipedia" | "wikimedia";
}

async function searchWikipedia(query: string): Promise<ImageHit[]> {
  // Step 1 — opensearch returns up to N matching article titles ranked by
  // popularity. Lets us recover the right page for fuzzy spellings.
  const opensearchUrl =
    `https://en.wikipedia.org/w/api.php?` +
    new URLSearchParams({
      action: "opensearch",
      search: query,
      limit: "5",
      namespace: "0",
      format: "json",
      origin: "*",
    }).toString();

  let titles: string[] = [];
  try {
    const res = await fetch(opensearchUrl, {
      headers: FETCH_HEADERS,
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    if (Array.isArray(data) && Array.isArray(data[1])) {
      titles = data[1].filter((t): t is string => typeof t === "string");
    }
  } catch {
    return [];
  }

  if (titles.length === 0) return [];

  // Step 2 — fetch each summary in parallel. The REST summary endpoint is
  // cached and very fast (10-50ms each).
  const summaries = await Promise.all(
    titles.slice(0, 5).map(async (title): Promise<ImageHit | null> => {
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
        title,
      )}`;
      try {
        const res = await fetch(url, {
          headers: FETCH_HEADERS,
          cache: "no-store",
        });
        if (!res.ok) return null;
        const body = (await res.json()) as {
          title?: string;
          thumbnail?: { source?: string };
          originalimage?: { source?: string };
        };
        const fullUrl = body.originalimage?.source;
        const thumbUrl = body.thumbnail?.source ?? fullUrl;
        if (!thumbUrl) return null;
        return {
          url: fullUrl ?? thumbUrl,
          thumbnail: thumbUrl,
          title: body.title ?? title,
          source: "wikipedia",
        };
      } catch {
        return null;
      }
    }),
  );

  return summaries.filter((s): s is ImageHit => s !== null);
}

async function searchWikimediaCommons(query: string): Promise<ImageHit[]> {
  try {
    const params = new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: query,
      gsrnamespace: "6", // File namespace
      gsrlimit: "12",
      prop: "imageinfo",
      iiprop: "url|thumburl|mime",
      iiurlwidth: "300",
      format: "json",
      origin: "*",
    });
    const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
      headers: FETCH_HEADERS,
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      query?: {
        pages?: Record<
          string,
          {
            title?: string;
            imageinfo?: { url: string; thumburl: string; mime: string }[];
          }
        >;
      };
    };

    return Object.values(data.query?.pages ?? {})
      .flatMap((p): ImageHit[] => {
        const info = p.imageinfo?.[0];
        if (!info) return [];
        if (!IMAGE_EXTENSIONS.test(info.url)) return [];
        if (info.mime?.startsWith("audio") || info.mime?.startsWith("video")) {
          return [];
        }
        return [
          {
            url: info.url,
            thumbnail: info.thumburl || info.url,
            title: (p.title ?? "").replace("File:", "").replace(/_/g, " "),
            source: "wikimedia",
          },
        ];
      })
      .slice(0, 12);
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const r = limiter(request);
  if (!r.allowed) return r.response;

  const q = request.nextUrl.searchParams
    .get("q")
    ?.trim()
    .slice(0, MAX_QUERY_LENGTH);
  if (!q) return NextResponse.json({ images: [] });

  // Run both sources in parallel. Wikipedia is usually the better hit for
  // proper nouns, so it leads in the merged list.
  const [wikipediaHits, commonsHits] = await Promise.all([
    searchWikipedia(q),
    searchWikimediaCommons(q),
  ]);

  // Dedupe by URL (Wikipedia summary thumbnails are sometimes the same as
  // Commons items).
  const seen = new Set<string>();
  const merged: ImageHit[] = [];
  for (const hit of [...wikipediaHits, ...commonsHits]) {
    const key = hit.url;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(hit);
    if (merged.length >= 18) break;
  }

  return NextResponse.json({ images: merged });
}
