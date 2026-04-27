"use client";

import React from "react";

import { PinnedStageOverlay } from "../PinnedStageOverlay";
import { WebcamOverlay } from "../WebcamOverlay";
import { FullscreenChatOverlay } from "./FullscreenChatOverlay";
import { PlayerMediaRenderer } from "./PlayerMediaRenderer";
import {
  parseDraggedTilePayload,
  TILE_DND_MIME,
  type DraggedTilePayload,
} from "../../lib/dnd";

import type { FullscreenChatMessage, RemoteStream, StageView } from "./types";

export function PlayerViewport({
  playerContainerRef,
  togglePlayerFullscreen,
  isPlayerFullscreen,

  isDraggingTile,
  setIsDraggingTile,
  isStageDragOver,
  setIsStageDragOver,
  setPinnedStage,

  stageView,
  screenStageContainerRef,
  toggleScreenFullscreen,
  isScreenFullscreen,
  onUnpinStage,

  localCamTrack,
  localUsername,
  remotes,
  setCamEnabled,

  fullscreenChatOpen,
  setFullscreenChatOpen,
  fullscreenChatMessages,
  chatText,
  setChatText,
  handleSendChat,
  isConnected,

  mediaProps,
  extraOverlay,
}: {
  playerContainerRef: React.RefObject<HTMLDivElement | null>;
  togglePlayerFullscreen: () => void;
  isPlayerFullscreen: boolean;

  isDraggingTile: boolean;
  setIsDraggingTile: React.Dispatch<React.SetStateAction<boolean>>;
  isStageDragOver: boolean;
  setIsStageDragOver: React.Dispatch<React.SetStateAction<boolean>>;
  setPinnedStage: React.Dispatch<
    React.SetStateAction<DraggedTilePayload | null>
  >;

  stageView: StageView | null;
  screenStageContainerRef: React.RefObject<HTMLDivElement | null>;
  toggleScreenFullscreen: () => void;
  isScreenFullscreen: boolean;
  onUnpinStage: () => void;

  localCamTrack: MediaStreamTrack | null;
  localUsername?: string | null;
  remotes: RemoteStream[];
  setCamEnabled: (enabled: boolean) => void;

  fullscreenChatOpen: boolean;
  setFullscreenChatOpen: React.Dispatch<React.SetStateAction<boolean>>;
  fullscreenChatMessages: FullscreenChatMessage[];
  chatText: string;
  setChatText: React.Dispatch<React.SetStateAction<string>>;
  handleSendChat: (e: React.FormEvent) => void;
  isConnected: boolean;

  mediaProps: React.ComponentProps<typeof PlayerMediaRenderer>;
  /** Optional overlay rendered inside the player container, above the iframe. */
  extraOverlay?: React.ReactNode;
}) {
  return (
    <div
      className={`w-full aspect-video bg-black/40 rounded-2xl relative overflow-hidden border border-white/10 ${
        isStageDragOver ? "ring-2 ring-indigo-500/30" : ""
      }`}
      ref={playerContainerRef}
    >
      <div className="absolute top-3 right-3 z-50 flex items-center gap-2">
        {isPlayerFullscreen && (
          <button
            type="button"
            onClick={() => setFullscreenChatOpen((v) => !v)}
            className="h-10 px-4 rounded-xl border border-white/20 bg-black/50 text-slate-50 text-sm font-semibold hover:bg-white/10 transition-colors"
            title={fullscreenChatOpen ? "Hide chat" : "Show chat"}
          >
            {fullscreenChatOpen ? "Hide chat" : "Chat"}
          </button>
        )}

        <button
          type="button"
          onClick={togglePlayerFullscreen}
          className="h-10 px-4 rounded-xl border border-white/20 bg-slate-50 text-slate-950 text-sm font-semibold hover:bg-slate-50/90 transition-colors shadow-sm"
          title="Fullscreen (with webcams)"
        >
          {isPlayerFullscreen ? "Exit" : "Fullscreen"}
        </button>
      </div>

      <FullscreenChatOverlay
        isPlayerFullscreen={isPlayerFullscreen}
        open={fullscreenChatOpen}
        setOpen={setFullscreenChatOpen}
        playerContainerRef={playerContainerRef}
        isConnected={isConnected}
        messages={fullscreenChatMessages}
        chatText={chatText}
        setChatText={setChatText}
        handleSendChat={handleSendChat}
      />

      {/*
        Important: the player area is covered by iframes/videos which don't bubble
        drag/drop events. This overlay activates only while dragging, so dropping
        onto the main player reliably pins.
      */}
      <div
        className={`absolute inset-0 z-40 ${
          isDraggingTile ? "pointer-events-auto" : "pointer-events-none"
        }`}
        onDragOver={(e) => {
          if (!isDraggingTile) return;
          const types = Array.from(e.dataTransfer.types ?? []);
          const ok =
            types.includes(TILE_DND_MIME) || types.includes("text/plain");
          if (!ok) return;
          e.preventDefault();
          setIsStageDragOver(true);
          e.dataTransfer.dropEffect = "move";
        }}
        onDragEnter={() => {
          if (!isDraggingTile) return;
          setIsStageDragOver(true);
        }}
        onDragLeave={(e) => {
          if (!isDraggingTile) return;
          const next = e.relatedTarget as Node | null;
          if (next && e.currentTarget.contains(next)) return;
          setIsStageDragOver(false);
        }}
        onDrop={(e) => {
          if (!isDraggingTile) return;
          e.preventDefault();
          setIsStageDragOver(false);
          setIsDraggingTile(false);
          const raw =
            e.dataTransfer.getData(TILE_DND_MIME) ||
            e.dataTransfer.getData("text/plain");
          const payload = parseDraggedTilePayload(raw);
          if (!payload) return;
          setPinnedStage(payload);
        }}
      />

      {stageView && (
        <PinnedStageOverlay
          stageId={stageView.id}
          isLocal={stageView.isLocal}
          stream={stageView.stream}
          containerRef={screenStageContainerRef}
          onUnpin={onUnpinStage}
          onToggleFullscreen={toggleScreenFullscreen}
          isFullscreen={isScreenFullscreen}
        />
      )}

      <WebcamOverlay
        active={isPlayerFullscreen}
        localCamTrack={localCamTrack}
        localUsername={localUsername}
        containerRef={playerContainerRef}
        remotes={remotes}
        onCloseLocal={() => setCamEnabled(false)}
      />

      <PlayerMediaRenderer {...mediaProps} />

      {extraOverlay}
    </div>
  );
}
