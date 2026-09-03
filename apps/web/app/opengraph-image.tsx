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
        background:
          "linear-gradient(145deg, #12100e 0%, #21170f 62%, #8a4f08 140%)",
      }}
    >
      <div style={{ display: "flex", marginBottom: 20 }}>
        <PopcornMark size={200} />
      </div>
      <div
        style={{
          fontSize: 72,
          fontWeight: "bold",
          color: "#f2ede6",
          letterSpacing: -2,
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
