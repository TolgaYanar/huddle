"use client";

import React, { useEffect, useRef } from "react";
import { WebRTCMediaState } from "shared-logic";
import { DraggedTilePayload, TILE_DND_MIME } from "../lib/dnd";

export function RemoteTile({
  id,
  stream,
  speaking,
  label,
  media,
  draggablePayload,
  onDraggingChange,
  extraActions,
}: {
  id: string;
  stream: MediaStream;
  speaking: boolean;
  label: string;
  media?: WebRTCMediaState;
  draggablePayload?: DraggedTilePayload;
  onDraggingChange?: (dragging: boolean) => void;
  extraActions?: React.ReactNode;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Track which stream is currently wired so we don't reassign srcObject
  // (and re-initialize the element) on every parent re-render when the
  // underlying MediaStream hasn't actually changed.
  const wiredVideoStreamRef = useRef<MediaStream | null>(null);
  const wiredAudioStreamRef = useRef<MediaStream | null>(null);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      const el = videoRef.current;
      if (!el) return;
      const maybeReq = (
        el as unknown as { requestFullscreen?: () => Promise<void> }
      ).requestFullscreen;
      if (maybeReq) {
        await maybeReq.call(el);
        return;
      }

      const parent = el.parentElement as unknown as {
        requestFullscreen?: () => Promise<void>;
      } | null;
      await parent?.requestFullscreen?.();
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!videoRef.current) return;
    if (wiredVideoStreamRef.current === stream) return;
    videoRef.current.srcObject = stream;
    wiredVideoStreamRef.current = stream;
    // Autoplay can be flaky; try to start.
    videoRef.current.play().catch(() => {
      // ignore
    });
  }, [stream]);

  useEffect(() => {
    if (!audioRef.current) return;
    if (wiredAudioStreamRef.current === stream) return;
    audioRef.current.srcObject = stream;
    wiredAudioStreamRef.current = stream;
    // Audio autoplay may be blocked until user interaction.
    audioRef.current.play().catch(() => {
      // ignore
    });
  }, [stream]);

  const hasVideo = stream.getVideoTracks().length > 0;
  const hasAudio = stream.getAudioTracks().length > 0;

  return (
    <div
      className={`rounded-[var(--radius-panel)] border border-hairline bg-sunken overflow-hidden relative ${
        speaking ? "ring-2 ring-emerald-500/20" : ""
      }`}
      draggable={Boolean(draggablePayload)}
      onDragStart={(e) => {
        if (!draggablePayload) return;
        onDraggingChange?.(true);
        e.dataTransfer.effectAllowed = "move";
        try {
          e.dataTransfer.setData(
            TILE_DND_MIME,
            JSON.stringify(draggablePayload),
          );
        } catch {
          // ignore
        }
        if (draggablePayload.kind === "remote") {
          e.dataTransfer.setData(
            "text/plain",
            `remote:${draggablePayload.peerId}`,
          );
        } else {
          e.dataTransfer.setData("text/plain", "local");
        }
      }}
      onDragEnd={() => {
        onDraggingChange?.(false);
      }}
      title="Drag to the main player to pin"
    >
      <div className="absolute top-2 left-2 z-10 flex items-center gap-2">
        <span className="text-[11px] px-2 py-1 rounded-full bg-sunken border border-hairline text-ink">
          {label}
        </span>
        {speaking && (
          <span className="text-[11px] px-2 py-1 rounded-full bg-positive-soft border border-positive text-positive">
            Speaking
          </span>
        )}
      </div>

      <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
        {extraActions}
        <button
          type="button"
          onMouseDown={(e) => {
            // Prevent starting a drag from the button.
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void toggleFullscreen();
          }}
          className="h-9 w-9 inline-flex items-center justify-center rounded-[var(--radius-control)] border border-hairline-strong bg-black/65 text-white text-sm hover:bg-raised transition-colors"
          title="Fullscreen"
          aria-label={`Toggle fullscreen for ${label}`}
        >
          <span aria-hidden="true">⛶</span>
        </button>

        <span className="text-[11px] px-2 py-1 rounded-full bg-sunken border border-hairline text-ink-muted">
          {media?.screen ? "🖥" : media?.cam ? "📷" : ""}
          {media?.mic ? " 🎙" : ""}
        </span>
      </div>

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full aspect-video object-cover"
      />

      <audio ref={audioRef} autoPlay className="hidden" />

      {!hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center text-ink-muted text-sm">
          Video off
        </div>
      )}
      {!hasAudio && (
        <div className="absolute bottom-2 left-2 text-[11px] px-2 py-1 rounded-full bg-sunken border border-hairline text-ink-muted">
          Mic off
        </div>
      )}

      <div className="sr-only">Remote user {id}</div>
    </div>
  );
}
