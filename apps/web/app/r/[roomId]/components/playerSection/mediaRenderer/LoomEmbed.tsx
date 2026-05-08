"use client";

import React from "react";

/**
 * Loom basic embed. Loom's iframe doesn't expose a public play/pause/seek
 * API the way Vimeo/Dailymotion do, so this is Tier 2 — every viewer hits
 * play themselves and we just keep the URL in sync. Same shape as KickEmbed
 * and TwitchEmbed.
 */
export function LoomEmbed({
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
      title="Loom embed"
      className="absolute inset-0 w-full h-full"
      allow="autoplay; fullscreen; picture-in-picture"
      allowFullScreen
      referrerPolicy="origin"
      onLoad={onLoad}
    />
  );
}
