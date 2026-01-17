import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

async function tryReadPublicAssetDataUrl(): Promise<string | null> {
  const publicDir = path.join(process.cwd(), "public");

  for (const svgName of ["favicon.svg", "popcorn_favicon.svg"]) {
    try {
      const svg = await readFile(path.join(publicDir, svgName), "utf8");
      const encoded = encodeURIComponent(svg);
      return `data:image/svg+xml;charset=utf-8,${encoded}`;
    } catch {
      // try next
    }
  }

  for (const pngName of ["favicon.png"]) {
    try {
      const buf = await readFile(path.join(publicDir, pngName));
      return `data:image/png;base64,${buf.toString("base64")}`;
    } catch {
      // try next
    }
  }

  return null;
}

export default async function AppleIcon() {
  const favicon = await tryReadPublicAssetDataUrl();
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)",
      }}
    >
      {favicon ? (
        <img
          src={favicon}
          width={160}
          height={160}
          style={{ borderRadius: 32 }}
        />
      ) : (
        <div style={{ fontSize: 96 }}>🍿</div>
      )}
    </div>,
    {
      ...size,
    }
  );
}
