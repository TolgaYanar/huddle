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
  remoteStreams: Array<{ id: string; stream: MediaStream }>;
  remoteSpeaking: Record<string, boolean>;
  remoteMedia: Record<string, WebRTCMediaState>;
  onKickUser: (targetId: string) => void;
  getDisplayName: (id: string) => string;
  setIsDraggingTile: (v: boolean) => void;
  setIsStageDragOver: (v: boolean) => void;
}) {
  const {
    userId,
    hostId,
    isHost,
    localSpeaking,
    camEnabled,
    screenEnabled,
    localVideoRef,
    remoteStreams,
    remoteSpeaking,
    remoteMedia,
    onKickUser,
    getDisplayName,
    setIsDraggingTile,
    setIsStageDragOver,
  } = props;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
      <div
        className={`rounded-2xl border border-white/10 bg-black/20 overflow-hidden relative ${
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
          <span className="text-[11px] px-2 py-1 rounded-full bg-black/40 border border-white/10 text-slate-200">
            You
          </span>
          {hostId && userId === hostId && (
            <span className="text-[11px] px-2 py-1 rounded-full bg-amber-500/15 border border-amber-500/20 text-amber-200">
              Host
            </span>
          )}
        </div>
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
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
            className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-white/20 bg-black/60 text-slate-50 text-sm hover:bg-white/10 transition-colors"
            title="Fullscreen"
          >
            ⛶
          </button>
        </div>
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="w-full aspect-video object-cover"
        />
        {!camEnabled && !screenEnabled && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
            Camera/screen off
          </div>
        )}
      </div>

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
              isHost ? (
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
                  className="h-9 px-3 inline-flex items-center justify-center rounded-xl border border-white/20 bg-black/60 text-slate-50 text-xs font-medium hover:bg-white/10 transition-colors"
                  title="Kick user (host only)"
                >
                  Kick
                </button>
              ) : null
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
