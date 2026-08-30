import { ImageResponse } from "next/og";

import { PopcornMark } from "./_components/PopcornMark";

export const alt = "WeHuddle";
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";
export default function OpenGraphImage() {
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
      <div style={{ display: "flex", marginBottom: 20 }}>
        <PopcornMark size={200} />
      </div>
      <div
        style={{
          fontSize: 72,
          fontWeight: "bold",
          color: "white",
        }}
      >
        WeHuddle
      </div>
    </div>,
    {
      ...size,
    },
  );
}
