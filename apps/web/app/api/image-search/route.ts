import { type NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ images: [] });

  try {
    // Step 1 — get the vqd token DuckDuckGo requires for image API calls
    const initRes = await fetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(q)}&iax=images&ia=images`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      },
    );

    const html = await initRes.text();

    // vqd appears as: vqd="4-..." or vqd=4-...
    const vqdMatch =
      html.match(/vqd="([^"]+)"/) || html.match(/vqd=([\d-]+)/);
    const vqd = vqdMatch?.[1];

    if (!vqd) {
      return NextResponse.json({ images: [], error: "token_missing" });
    }

    // Step 2 — fetch image results
    const imgUrl =
      `https://duckduckgo.com/i.js` +
      `?q=${encodeURIComponent(q)}&o=json&p=1&s=0&u=bing&f=,,,&l=us-en` +
      `&vqd=${encodeURIComponent(vqd)}`;

    const imgRes = await fetch(imgUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Referer: "https://duckduckgo.com/",
        Accept: "application/json, text/javascript, */*; q=0.01",
      },
    });

    const data = (await imgRes.json()) as {
      results?: {
        image: string;
        thumbnail: string;
        title: string;
        width: number;
        height: number;
      }[];
    };

    const images = (data.results ?? []).slice(0, 16).map((r) => ({
      url: r.image,
      thumbnail: r.thumbnail,
      title: r.title,
    }));

    return NextResponse.json({ images });
  } catch {
    return NextResponse.json({ images: [], error: "search_failed" });
  }
}
