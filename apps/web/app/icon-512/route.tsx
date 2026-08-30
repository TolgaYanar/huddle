import { ImageResponse } from "next/og";

import { PopcornMark } from "../_components/PopcornMark";

const SIZE = 512;

export function GET() {
  return new ImageResponse(
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
      <PopcornMark size={Math.round(SIZE * 0.78)} />
    </div>,
    {
      width: SIZE,
      height: SIZE,
    },
  );
}
