import { NextResponse } from "next/server";

import { createRouteRateLimiter } from "../_lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Proxies image generation through Pollinations
 * (https://image.pollinations.ai). Free, no auth, no cost — but the upstream
 * is rate-limited per IP, so we also apply our own per-IP cap to absorb
 * abuse before it hits them.
 *
 * The route returns a JSON `{ ok: true, url }` rather than the image bytes,
 * because Pollinations URLs are stable for a given prompt — passing back the
 * URL lets the client embed it directly with `<img src=…>` and benefit from
 * the browser's image cache.
 *
 * It also doubles as a "search by description" backend: clients use the same
 * route whether the user typed a search term ("apple logo") or a creative
 * prompt ("a red dragon eating ice cream").
 */

const limiter = createRouteRateLimiter({ windowMs: 60_000, max: 12 });
const MAX_PROMPT_LENGTH = 240;

function pickInt(value: string | null, fallback: number, min: number, max: number) {
  const n = Number(value ?? "");
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export async function GET(req: Request) {
  const r = limiter(req);
  if (!r.allowed) return r.response;

  const { searchParams } = new URL(req.url);
  const promptRaw = (searchParams.get("prompt") ?? "").trim().slice(0, MAX_PROMPT_LENGTH);
  if (!promptRaw) {
    return NextResponse.json({ ok: false, reason: "missing_prompt" }, { status: 400 });
  }

  const width = pickInt(searchParams.get("width"), 768, 256, 1024);
  const height = pickInt(searchParams.get("height"), 768, 256, 1024);
  // Stable seed for the same prompt → same image. Lets clients cache.
  const seedParam = searchParams.get("seed");
  const seed = seedParam ? pickInt(seedParam, 0, 0, 999_999_999) : null;

  // Pollinations accepts a URL-encoded prompt path segment.
  const url = new URL(
    `https://image.pollinations.ai/prompt/${encodeURIComponent(promptRaw)}`,
  );
  url.searchParams.set("width", String(width));
  url.searchParams.set("height", String(height));
  url.searchParams.set("nologo", "true"); // request no watermark
  if (seed !== null) url.searchParams.set("seed", String(seed));

  return NextResponse.json({ ok: true, url: url.toString(), prompt: promptRaw });
}
