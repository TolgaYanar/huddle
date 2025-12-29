"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { WebRTCMediaState } from "shared-logic";

type RemoteStream = {
  id: string;
  stream: MediaStream;
  media?: WebRTCMediaState;
};

export function WebcamOverlay({
  active,
  localCamTrack,
  remotes,
  containerRef,
  onCloseLocal,
}: {
  active: boolean;
  localCamTrack: MediaStreamTrack | null;
  remotes: RemoteStream[];
  containerRef?: React.RefObject<HTMLElement | null>;
  onCloseLocal?: () => void;
}) {
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const [{ x, y }, setPos] = useState({ x: 12, y: 12 });
  const [thumbWidth, setThumbWidth] = useState(112);
  const resizingRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startWidth: number;
  } | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
  } | null>(null);

  useEffect(() => {
    if (!active) return;
    setPos({ x: 12, y: 12 });
  }, [active]);

  const setVideoRef = (id: string) => (el: HTMLVideoElement | null) => {
    if (!el) {
      videoRefs.current.delete(id);
      return;
    }
    videoRefs.current.set(id, el);
  };

  useEffect(() => {
    const setStreamFor = (id: string, track: MediaStreamTrack | null) => {
      const el = videoRefs.current.get(id);
      if (!el) return;
      try {
        el.srcObject = track ? new MediaStream([track]) : null;
      } catch {
        // ignore
      }
    };

    if (!active) {
      for (const el of videoRefs.current.values()) {
        try {
          el.srcObject = null;
        } catch {
          // ignore
        }
      }
      return;
    }

    setStreamFor("local", localCamTrack);

    for (const r of remotes) {
      const camEnabled = Boolean(r.media?.cam);
      if (!camEnabled) {
        setStreamFor(r.id, null);
        continue;
      }

      const tracks = r.stream.getVideoTracks();
      let track: MediaStreamTrack | null = null;

      for (const t of tracks) {
        const settings = t.getSettings?.() ?? {};
        // getDisplayMedia video tracks typically expose displaySurface.
        if (!("displaySurface" in settings)) {
          track = t;
          break;
        }
      }

      track = track ?? tracks[0] ?? null;
      setStreamFor(r.id, track);
    }
  }, [active, localCamTrack, remotes]);

  const hasLocal = Boolean(localCamTrack);
  const remoteCamCount = remotes.filter((r) => Boolean(r.media?.cam)).length;
  const hasAny = hasLocal || remoteCamCount > 0;

  const camRemotes = useMemo(
    () => remotes.filter((r) => Boolean(r.media?.cam)),
    [remotes]
  );

  // Debug logging
  useEffect(() => {
    if (active) {
      console.log("[WebcamOverlay] Active:", {
        hasLocal,
        remoteCamCount,
        hasAny,
        remotes: remotes.map((r) => ({
          id: r.id,
          hasCam: r.media?.cam,
          hasStream: !!r.stream,
        })),
        localCamTrack: !!localCamTrack,
      });
    }
  }, [active, hasLocal, remoteCamCount, hasAny, remotes, localCamTrack]);

  const thumbHeight = Math.round(thumbWidth * (2 / 3));

  if (!active || !hasAny) return null;

  return (
    <div
      ref={overlayRef}
      className="absolute z-50 pointer-events-auto touch-none cursor-move select-none"
      style={{ left: x, top: y }}
      onPointerDown={(e) => {
        if (!active) return;
        if (resizingRef.current) return;
        dragStateRef.current = {
          pointerId: e.pointerId,
          startClientX: e.clientX,
          startClientY: e.clientY,
          startX: x,
          startY: y,
        };
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        const rz = resizingRef.current;
        if (rz && rz.pointerId === e.pointerId) {
          const dx = e.clientX - rz.startClientX;
          const dy = e.clientY - rz.startClientY;
          const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
          const next = Math.min(220, Math.max(72, rz.startWidth + delta));
          setThumbWidth(next);
          e.preventDefault();
          return;
        }

        const s = dragStateRef.current;
        if (!s || s.pointerId !== e.pointerId) return;

        const dx = e.clientX - s.startClientX;
        const dy = e.clientY - s.startClientY;

        let nextX = s.startX + dx;
        let nextY = s.startY + dy;

        const containerEl = containerRef?.current ?? null;
        const overlayEl = overlayRef.current;
        if (containerEl && overlayEl) {
          const cr = containerEl.getBoundingClientRect();
          const or = overlayEl.getBoundingClientRect();
          const maxX = Math.max(0, cr.width - or.width);
          const maxY = Math.max(0, cr.height - or.height);
          nextX = Math.min(Math.max(0, nextX), maxX);
          nextY = Math.min(Math.max(0, nextY), maxY);
        }

        setPos({ x: nextX, y: nextY });
        e.preventDefault();
      }}
      onPointerUp={(e) => {
        const rz = resizingRef.current;
        if (rz && rz.pointerId === e.pointerId) {
          resizingRef.current = null;
          try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
          } catch {
            // ignore
          }
          e.preventDefault();
          return;
        }

        const s = dragStateRef.current;
        if (!s || s.pointerId !== e.pointerId) return;
        dragStateRef.current = null;
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        e.preventDefault();
      }}
      onPointerCancel={(e) => {
        const rz = resizingRef.current;
        if (rz && rz.pointerId === e.pointerId) {
          resizingRef.current = null;
          try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
          } catch {
            // ignore
          }
          return;
        }

        const s = dragStateRef.current;
        if (!s || s.pointerId !== e.pointerId) return;
        dragStateRef.current = null;
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }}
    >
      <div className="backdrop-blur-md bg-black/30 border border-white/10 rounded-2xl p-2">
        <div className="flex items-center gap-2 overflow-x-auto max-w-[85vw]">
          {hasLocal && (
            <div className="relative">
              <video
                ref={setVideoRef("local")}
                autoPlay
                playsInline
                muted
                className="rounded-xl object-cover border border-white/10 bg-black"
                style={{ width: thumbWidth, height: thumbHeight }}
              />
              {onCloseLocal && (
                <button
                  type="button"
                  onClick={onCloseLocal}
                  className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/70 hover:bg-black/90 text-white text-xs inline-flex items-center justify-center border border-white/20"
                  title="Turn off my camera"
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {camRemotes.map((r) => (
            <video
              key={r.id}
              ref={setVideoRef(r.id)}
              autoPlay
              playsInline
              muted
              className="rounded-xl object-cover border border-white/10 bg-black"
              style={{ width: thumbWidth, height: thumbHeight }}
            />
          ))}
        </div>

        <button
          type="button"
          className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full border border-white/10 bg-black/50 text-slate-200 text-xs inline-flex items-center justify-center cursor-nwse-resize"
          title="Resize cameras"
          onPointerDown={(e) => {
            if (!active) return;
            resizingRef.current = {
              pointerId: e.pointerId,
              startClientX: e.clientX,
              startClientY: e.clientY,
              startWidth: thumbWidth,
            };
            try {
              (overlayRef.current as HTMLElement | null)?.setPointerCapture(
                e.pointerId
              );
            } catch {
              // ignore
            }
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          ↔
        </button>
      </div>
    </div>
  );
}
