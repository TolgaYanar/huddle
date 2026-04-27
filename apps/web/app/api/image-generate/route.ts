import { NextResponse } from "next/server";

import { createRouteRateLimiter } from "../_lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-side proxy for AI image generation. Today the upstream is
 * Pollinations (https://image.pollinations.ai) — free, no auth, but rate
 * limits per upstream IP. Doing the fetch on the server (a) lets us return
 * a proper error to the client when the upstream rejects us, instead of a
 * broken `<img>`, (b) consolidates many client requests behind one IP for
 * better cache hits, and (c) lets us cache successful generations in
 * memory across requests.
 *
 * The endpoint returns a JSON `{ ok: true, dataUrl }` containing the image
 * encoded as a base64 data URL. Clients can drop this directly into an
 * `<img src>` and into the round.image field — the same data URL that
 * survives the round payload going through socket.io.
 */

const limiter = createRouteRateLimiter({ windowMs: 60_000, max: 12 });

const MAX_PROMPT_LENGTH = 240;
// Cap so the resulting base64 stays under our round-image budget (250 KB).
// 240 KB raw leaves comfortable headroom for the data: prefix once base64'd.
const MAX_BYTES = 240_000;
// Pollinations sometimes takes 30+ seconds for the first generation of a
// new prompt (it's queued behind whatever else its workers are doing).
const FETCH_TIMEOUT_MS = 60_000;
// Pixel dimensions — 512² × JPEG ≈ 60–180 KB, well within our budget.
const IMAGE_DIM = 512;

// Tiny LRU keyed by `prompt|seed`. Survives across requests within a single
// Vercel lambda instance lifetime; cold starts naturally clear it.
const CACHE_LIMIT = 40;
const cache: Map<string, { dataUrl: string; cachedAt: number }> = new Map();

function cacheGet(key: string) {
  const hit = cache.get(key);
  if (!hit) return null;
  // Bump LRU position.
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

function cacheSet(key: string, dataUrl: string) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, { dataUrl, cachedAt: Date.now() });
  while (cache.size > CACHE_LIMIT) {
    const first = cache.keys().next().value;
    if (first === undefined) break;
    cache.delete(first);
  }
}

function pickInt(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
) {
  const n = Number(value ?? "");
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function jsonError(reason: string, hint?: string, status = 200) {
  return NextResponse.json({ ok: false, reason, hint }, { status });
}

export async function GET(req: Request) {
  const r = limiter(req);
  if (!r.allowed) return r.response;

  const { searchParams } = new URL(req.url);
  const promptRaw = (searchParams.get("prompt") ?? "")
    .trim()
    .slice(0, MAX_PROMPT_LENGTH);
  if (!promptRaw) {
    return jsonError("missing_prompt", undefined, 400);
  }

  const seedParam = searchParams.get("seed");
  const seed = seedParam ? pickInt(seedParam, 0, 0, 999_999_999) : 0;

  const cacheKey = `${promptRaw}|${seed}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    return NextResponse.json({
      ok: true,
      dataUrl: cached.dataUrl,
      prompt: promptRaw,
      cached: true,
    });
  }

  const upstream = new URL(
    `https://image.pollinations.ai/prompt/${encodeURIComponent(promptRaw)}`,
  );
  upstream.searchParams.set("width", String(IMAGE_DIM));
  upstream.searchParams.set("height", String(IMAGE_DIM));
  upstream.searchParams.set("nologo", "true");
  upstream.searchParams.set("model", "flux"); // higher-quality default
  upstream.searchParams.set("seed", String(seed));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(upstream.toString(), {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "user-agent":
          "wehuddle-game/1.0 (+https://wehuddle.tv) — clue image generator",
      },
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof DOMException && err.name === "AbortError") {
      return jsonError(
        "timeout",
        "The image service took too long. Try again.",
      );
    }
    return jsonError(
      "network",
      "Couldn't reach the image service. Try again in a moment.",
    );
  }
  clearTimeout(timeout);

  if (res.status === 429 || res.status === 503) {
    return jsonError(
      "upstream_busy",
      "The image service is overloaded right now. Wait a few seconds and try again.",
    );
  }
  if (!res.ok) {
    return jsonError(
      "upstream_error",
      `The image service returned ${res.status}. Try a different prompt.`,
    );
  }

  const arrayBuffer = await res.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_BYTES) {
    return jsonError(
      "image_too_large",
      "Generated image is bigger than allowed. Try a simpler prompt.",
    );
  }

  const contentType =
    res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
  if (!contentType.startsWith("image/")) {
    return jsonError(
      "bad_response",
      "The image service returned something that wasn't an image.",
    );
  }

  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const dataUrl = `data:${contentType};base64,${base64}`;

  cacheSet(cacheKey, dataUrl);

  return NextResponse.json({
    ok: true,
    dataUrl,
    prompt: promptRaw,
    cached: false,
  });
}
