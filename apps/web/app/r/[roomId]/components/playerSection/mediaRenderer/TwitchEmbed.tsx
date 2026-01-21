"use client";

import React from "react";

export function TwitchEmbed({
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
      title="Twitch embed"
      className="absolute inset-0 w-full h-full"
      allow="autoplay; fullscreen; picture-in-picture"
      allowFullScreen
      referrerPolicy="origin"
      onLoad={onLoad}
    />
  );
}
