import { type NextRequest, NextResponse } from "next/server";

const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|svg)$/i;

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ images: [] });

  try {
    const params = new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: q,
      gsrnamespace: "6", // File namespace only
      gsrlimit: "20",
      prop: "imageinfo",
      iiprop: "url|thumburl|mime",
      iiurlwidth: "300",
      format: "json",
      origin: "*",
    });

    const res = await fetch(
      `https://commons.wikimedia.org/w/api.php?${params}`,
      {
        headers: { "User-Agent": "huddle-app/1.0 (image search)" },
      },
    );

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

    const images = Object.values(data.query?.pages ?? {})
      .flatMap((p) => {
        const info = p.imageinfo?.[0];
        if (!info) return [];
        if (!IMAGE_EXTENSIONS.test(info.url)) return [];
        if (info.mime?.startsWith("audio") || info.mime?.startsWith("video")) return [];
        return [{
          url: info.url,
          thumbnail: info.thumburl || info.url,
          title: (p.title ?? "").replace("File:", "").replace(/_/g, " "),
        }];
      })
      .slice(0, 16);

    return NextResponse.json({ images });
  } catch (err) {
    console.error("Image search error:", err);
    return NextResponse.json({ images: [], error: "search_failed" });
  }
}
