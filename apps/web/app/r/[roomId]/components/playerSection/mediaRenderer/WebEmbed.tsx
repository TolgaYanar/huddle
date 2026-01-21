"use client";

import React from "react";

export function WebEmbed({
  url,
  canPlay,
  onLoad,
}: {
  url: string;
  canPlay: boolean;
  onLoad: () => void;
}) {
  return (
    <iframe
      key={url}
      src={canPlay ? url : undefined}
      title="Embedded site"
      className="absolute inset-0 w-full h-full"
      allow="autoplay; fullscreen; picture-in-picture; xr-spatial-tracking; encrypted-media; clipboard-write"
      allowFullScreen
      referrerPolicy="origin"
      onLoad={onLoad}
    />
  );
}
