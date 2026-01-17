import { ImageResponse } from "next/og";

export const runtime = "edge";

export const size = {
  width: 48,
  height: 48,
};

export const contentType = "image/png";
export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)",
        borderRadius: "6px",
      }}
    >
      <div style={{ fontSize: 28 }}>🍿</div>
    </div>,
    {
      ...size,
    }
  );
}
