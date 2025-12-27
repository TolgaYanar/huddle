"use client";

import React from "react";
import { ScreenShareStage } from "./ScreenShareStage";

export function PinnedStageOverlay({
  stageId,
  isLocal,
  stream,
  containerRef,
  onUnpin,
  onToggleFullscreen,
  isFullscreen,
}: {
  stageId: string;
  isLocal: boolean;
  stream: MediaStream;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onUnpin: () => void;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
}) {
  return (
    <div className="absolute inset-0 z-20 bg-black" ref={containerRef}>
      <div className="absolute top-3 left-3 z-30">
        <span className="px-2.5 py-1 rounded-full text-[11px] font-medium border border-white/10 bg-black/40 text-slate-200">
          Pinned {isLocal ? "(You)" : stageId.slice(0, 6)}
        </span>
      </div>
      <div className="absolute top-3 right-3 z-30">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onUnpin}
            className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 text-slate-200 text-xs font-medium hover:bg-white/10 transition-colors"
            title="Unpin"
          >
            Unpin
          </button>
          <button
            type="button"
            onClick={onToggleFullscreen}
            className="h-10 px-4 rounded-xl border border-white/20 bg-slate-50 text-slate-950 text-sm font-semibold hover:bg-slate-50/90 transition-colors shadow-sm"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? "Exit" : "⛶ Fullscreen"}
          </button>
        </div>
      </div>
      <ScreenShareStage stream={stream} />
    </div>
  );
}
