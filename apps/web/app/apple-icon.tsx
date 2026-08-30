import { ImageResponse } from "next/og";

import { PopcornMark } from "./_components/PopcornMark";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
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
      <PopcornMark size={132} />
    </div>,
    {
      ...size,
    },
  );
}
