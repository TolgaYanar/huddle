import { ImageResponse } from "next/og";

import { PopcornMark } from "../_components/PopcornMark";

const SIZE = 192;

export function GET() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "linear-gradient(145deg, #12100e 0%, #2b1c11 68%, #8a4f08 100%)",
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
