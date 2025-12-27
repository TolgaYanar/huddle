import type { Metadata } from "next";

import RoomClient from "./room-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ roomId: string }>;
}): Promise<Metadata> {
  const { roomId } = await params;
  const safeRoomId = decodeURIComponent(roomId);

  const title = `Room ${safeRoomId}`;
  const description = "Join my WeHuddle room and watch together in sync.";

  return {
    title,
    description,
    alternates: {
      canonical: `/r/${encodeURIComponent(roomId)}`,
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: `/r/${encodeURIComponent(roomId)}`,
      images: [
        {
          url: `/r/${encodeURIComponent(roomId)}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: `WeHuddle room ${safeRoomId}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`/r/${encodeURIComponent(roomId)}/opengraph-image`],
    },
  };
}

export default async function RoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  return <RoomClient roomId={roomId} />;
}
