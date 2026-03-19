"use client";

import React, { useEffect } from "react";
import { GamePanel, type GamePanelProps } from "./GamePanel";

const GAME_TITLES: Record<string, string> = {
  "guess-it": "Guess It!",
};

export function GameModal({
  openGameId,
  onClose,
  gameProps,
}: {
  openGameId: string | null;
  onClose: () => void;
  gameProps: GamePanelProps;
}) {
  // Close on Escape
  useEffect(() => {
    if (!openGameId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openGameId, onClose]);

  if (!openGameId) return null;

  const title = GAME_TITLES[openGameId] ?? "Game";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-white/10 bg-slate-900/95 backdrop-blur-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎮</span>
            <div>
              <h2 className="text-lg font-bold text-slate-100">{title}</h2>
              {gameProps.gameState.games.some((g) => g.status === "active") && (
                <p className="text-xs text-sky-400 mt-0.5">Game in progress</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-xl border border-white/10 bg-white/5 text-slate-400 hover:text-slate-100 hover:bg-white/10 transition-colors inline-flex items-center justify-center text-lg"
            aria-label="Close game"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          {openGameId === "guess-it" && <GamePanel {...gameProps} />}
        </div>
      </div>
    </div>
  );
}
