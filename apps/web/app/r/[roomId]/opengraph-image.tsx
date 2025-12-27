import { ImageResponse } from "next/og";

export const runtime = "edge";

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
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)",
          color: "#fff",
          position: "relative",
        }}
      >
        {/* Decorative circles */}
        <div
          style={{
            position: "absolute",
            top: -100,
            right: -100,
            width: 400,
            height: 400,
            borderRadius: "50%",
            background: "rgba(139, 92, 246, 0.15)",
            filter: "blur(60px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -50,
            left: -50,
            width: 300,
            height: 300,
            borderRadius: "50%",
            background: "rgba(59, 130, 246, 0.15)",
            filter: "blur(60px)",
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
            <div style={{ fontSize: 56 }}>🍿</div>
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
            border: "2px solid rgba(255,255,255,0.2)",
            borderRadius: 24,
            background: "rgba(255,255,255,0.08)",
            backdropFilter: "blur(20px)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
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
              background: "linear-gradient(90deg, #fff 0%, #a78bfa 100%)",
              backgroundClip: "text",
              color: "transparent",
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
      </div>
    ),
    {
      ...size,
    }
  );
}
