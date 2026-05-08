"use client";

import React from "react";

/**
 * PeerTube basic embed. PeerTube actually exposes a postMessage Player API
 * (`@peertube/embed-api`) but per-instance behaviour varies and we'd need to
 * wire it into the room's playerRef contract. For now this is Tier 2 — the
 * URL is kept in sync across the room and each viewer presses play. Upgrade
 * path: swap to a sync-aware version mirroring DailymotionEmbed.
 */
export function PeerTubeEmbed({
  src,
  fallbackKey,
  onLoad,
}: {
  src: string | null;
  fallbackKey: string;
  onLoad: () => void;
}) {
  return (
    <iframe
      key={src ?? fallbackKey}
      src={src ?? undefined}
      title="PeerTube embed"
      className="absolute inset-0 w-full h-full"
      allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
      allowFullScreen
      referrerPolicy="origin"
      onLoad={onLoad}
    />
  );
}
