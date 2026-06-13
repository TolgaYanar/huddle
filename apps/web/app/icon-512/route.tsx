import { ImageResponse } from "next/og";

export const runtime = "edge";

const SIZE = 512;

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)",
        }}
      >
        {/* Glyph sized to sit within the central ~80% safe zone so the
            maskable variant is not clipped by circular/squircle masks. */}
        <div style={{ fontSize: Math.round(SIZE * 0.62), lineHeight: 1 }}>
          🍿
        </div>
      </div>
    ),
    {
      width: SIZE,
      height: SIZE,
    }
  );
}
