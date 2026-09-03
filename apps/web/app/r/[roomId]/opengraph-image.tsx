import { ImageResponse } from "next/og";

import { PopcornMark } from "../../_components/PopcornMark";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default async function OpenGraphImage({
  params,
}: {
  params: { roomId: string } | Promise<{ roomId: string }>;
}) {
  const resolvedParams = await Promise.resolve(params);

  let roomId = "";
  try {
    roomId = resolvedParams?.roomId
      ? decodeURIComponent(String(resolvedParams.roomId))
      : "";
  } catch {
    roomId = resolvedParams?.roomId ? String(resolvedParams.roomId) : "";
  }

  const displayRoomId = roomId || "(room)";
  const invitePath = roomId ? `/r/${roomId}` : "/r/...";

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 64,
        background:
          "linear-gradient(145deg, #12100e 0%, #21170f 66%, #8a4f08 145%)",
        color: "#f2ede6",
        position: "relative",
      }}
    >
      {/* One projector beam, matching the product surface rather than generic blobs. */}
      <div
        style={{
          position: "absolute",
          top: -180,
          left: 380,
          width: 440,
          height: 820,
          transform: "rotate(-13deg)",
          background:
            "linear-gradient(180deg, rgba(232,163,61,0.22), rgba(232,163,61,0))",
          opacity: 0.7,
        }}
      />
      {/* Film perforations are the single recurring brand ornament. */}
      <div
        style={{
          position: "absolute",
          top: 46,
          bottom: 46,
          left: 24,
          width: 12,
          background:
            "repeating-linear-gradient(to bottom, #8f775d 0px, #8f775d 18px, transparent 18px, transparent 38px)",
          opacity: 0.7,
        }}
      />

      {/* Header */}
      <div style={{ display: "flex", flexDirection: "column", zIndex: 1 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <PopcornMark size={56} />
          <div style={{ fontSize: 72, fontWeight: 900, letterSpacing: -2 }}>
            WeHuddle
          </div>
        </div>
        <div
          style={{
            marginTop: 12,
            fontSize: 32,
            opacity: 0.85,
            fontWeight: 500,
          }}
        >
          Watch together in perfect sync
        </div>
      </div>

      {/* Room Card */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
          padding: 32,
          border: "2px solid #3d362f",
          borderRadius: 12,
          background: "#1b1815",
          boxShadow: "0 12px 32px rgba(0,0,0,0.36)",
          zIndex: 1,
        }}
      >
        <div
          style={{
            fontSize: 24,
            opacity: 0.7,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Join Room
        </div>
        <div
          style={{
            fontSize: 56,
            fontWeight: 900,
            letterSpacing: -1,
            wordBreak: "break-word",
            color: "#e8a33d",
          }}
        >
          {displayRoomId}
        </div>
        <div
          style={{
            fontSize: 26,
            opacity: 0.75,
            fontWeight: 500,
            fontFamily: "monospace",
          }}
        >
          {`wehuddle.tv${invitePath}`}
        </div>
      </div>
    </div>,
    {
      ...size,
    },
  );
}
