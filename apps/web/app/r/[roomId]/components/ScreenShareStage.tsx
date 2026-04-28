"use client";

import React, { useEffect, useRef } from "react";

export function ScreenShareStage({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  // Avoid reassigning srcObject when the underlying MediaStream hasn't
  // changed — that re-initializes the element and stutters the screen
  // share, which the pinned overlay shows fullscreen.
  const wiredStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (wiredStreamRef.current === stream) return;
    ref.current.srcObject = stream;
    wiredStreamRef.current = stream;
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
