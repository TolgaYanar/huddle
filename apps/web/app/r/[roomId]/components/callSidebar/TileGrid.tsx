import React from "react";

import { RemoteTile } from "../RemoteTile";
import { TILE_DND_MIME, type DraggedTilePayload } from "../../lib/dnd";
import type { WebRTCMediaState } from "shared-logic";

export function TileGrid(props: {
  userId: string;
  hostId: string | null;
  isHost: boolean;
  localSpeaking: boolean;
  camEnabled: boolean;
  screenEnabled: boolean;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  setLocalVideoElement: React.RefCallback<HTMLVideoElement>;
  remoteStreams: Array<{ id: string; stream: MediaStream }>;
  remoteSpeaking: Record<string, boolean>;
  remoteMedia: Record<string, WebRTCMediaState>;
  onKickUser: (targetId: string) => void;
  getDisplayName: (id: string) => string;
  setIsDraggingTile: (v: boolean) => void;
  setIsStageDragOver: (v: boolean) => void;
  onPinTile: (payload: DraggedTilePayload) => void;
}) {
  const {
    userId,
    hostId,
    isHost,
    localSpeaking,
    camEnabled,
    screenEnabled,
    localVideoRef,
    setLocalVideoElement,
    remoteStreams,
    remoteSpeaking,
    remoteMedia,
    onKickUser,
    getDisplayName,
    setIsDraggingTile,
    setIsStageDragOver,
    onPinTile,
  } = props;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
      <div
        className={`rounded-[var(--radius-panel)] border border-hairline bg-sunken overflow-hidden relative ${
          localSpeaking ? "ring-2 ring-emerald-500/20" : ""
        }`}
        draggable
        onDragStart={(e) => {
          const payload: DraggedTilePayload = { kind: "local" };
          setIsDraggingTile(true);
          e.dataTransfer.effectAllowed = "move";
          try {
            e.dataTransfer.setData(TILE_DND_MIME, JSON.stringify(payload));
          } catch {
            // ignore
          }
          e.dataTransfer.setData("text/plain", "local");
        }}
        onDragEnd={() => {
          setIsDraggingTile(false);
          setIsStageDragOver(false);
        }}
        title="Drag to the main player to pin"
      >
        <div className="absolute top-2 left-2 z-10 flex items-center gap-2">
          <span className="text-[11px] px-2 py-1 rounded-full bg-sunken border border-hairline text-ink">
            You
          </span>
          {hostId && userId === hostId && (
            <span className="text-[11px] px-2 py-1 rounded-full bg-accent-tint border border-accent text-accent">
              Host
            </span>
          )}
        </div>
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPinTile({ kind: "local" })}
            className="h-9 px-2 inline-flex items-center justify-center rounded-[var(--radius-control)] border border-hairline-strong bg-black/65 text-white text-xs hover:bg-raised transition-colors"
            title="Pin your video to the main player"
            aria-label="Pin your video to the main player"
          >
            Pin
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              try {
                if (document.fullscreenElement) {
                  void document.exitFullscreen();
                  return;
                }
                void localVideoRef.current?.requestFullscreen?.();
              } catch {
                // ignore
              }
            }}
            className="h-9 w-9 inline-flex items-center justify-center rounded-[var(--radius-control)] border border-hairline-strong bg-black/65 text-white text-sm hover:bg-raised transition-colors"
            title="Fullscreen"
            aria-label="Toggle fullscreen"
          >
            <span aria-hidden="true">⛶</span>
          </button>
        </div>
        <video
          ref={setLocalVideoElement}
          autoPlay
          playsInline
          muted
          className="w-full aspect-video object-cover"
        />
        {!camEnabled && !screenEnabled && (
          <div className="absolute inset-0 flex items-center justify-center text-ink-muted text-sm">
            Your camera is off
          </div>
        )}
      </div>

      {/*
        Without this the column simply stopped: one dark rectangle and then a
        tall run of nothing, which reads as something failing to load rather
        than as an empty call. Say what the space is for instead.
      */}
      {remoteStreams.length === 0 && (
        <p className="px-1 py-3 text-center text-xs text-ink-faint text-balance">
          Everyone who joins the call shows up here. Watching together works
          without it.
        </p>
      )}

      {remoteStreams.map(({ id, stream }) => {
        const speaking = !!remoteSpeaking[id];
        const media = remoteMedia[id];
        const displayName = getDisplayName(id);
        const label =
          hostId && id === hostId ? `${displayName} • Host` : displayName;

        return (
          <RemoteTile
            key={id}
            id={id}
            stream={stream}
            speaking={speaking}
            label={label}
            media={media}
            extraActions={
              <>
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onPinTile({ kind: "remote", peerId: id });
                  }}
                  className="h-9 px-2 inline-flex items-center justify-center rounded-[var(--radius-control)] border border-hairline-strong bg-black/65 text-white text-xs hover:bg-raised transition-colors"
                  title={`Pin ${displayName} to the main player`}
                  aria-label={`Pin ${displayName} to the main player`}
                >
                  Pin
                </button>
                {isHost && (
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onKickUser(id);
                    }}
                    className="h-9 px-3 inline-flex items-center justify-center rounded-[var(--radius-control)] border border-hairline-strong bg-black/65 text-white text-xs font-medium hover:bg-raised transition-colors"
                    title="Kick user (host only)"
                  >
                    Kick
                  </button>
                )}
              </>
            }
            draggablePayload={{ kind: "remote", peerId: id }}
            onDraggingChange={(v) => {
              setIsDraggingTile(v);
              if (!v) setIsStageDragOver(false);
            }}
          />
        );
      })}
    </div>
  );
}
