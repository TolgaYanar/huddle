import { ImageResponse } from "next/og";

import { PopcornMark } from "./_components/PopcornMark";

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
        background:
          "linear-gradient(145deg, #12100e 0%, #2b1c11 68%, #8a4f08 100%)",
        borderRadius: "6px",
      }}
    >
      <PopcornMark size={38} />
    </div>,
    {
      ...size,
    },
  );
}
