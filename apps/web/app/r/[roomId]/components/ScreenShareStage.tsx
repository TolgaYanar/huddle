"use client";

import React, { useEffect, useRef } from "react";

export function ScreenShareStage({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.srcObject = stream;
    ref.current.play().catch(() => {
      // ignore
    });
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className="w-full h-full object-contain bg-black"
    />
  );
}
