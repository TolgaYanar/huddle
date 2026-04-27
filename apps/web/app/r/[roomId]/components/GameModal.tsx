"use client";

import React from "react";

import { Modal } from "../../../components/Modal";
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
  if (!openGameId) return null;

  const title = GAME_TITLES[openGameId] ?? "Game";
  const titleId = "game-modal-title";

  return (
    <Modal
      open={openGameId !== null}
      onClose={onClose}
      labelledBy={titleId}
      panelClassName="relative z-10 w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-white/10 bg-slate-900/95 backdrop-blur-xl shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden>
            🎮
          </span>
          <div>
            <h2 id={titleId} className="text-lg font-bold text-slate-100">
              {title}
            </h2>
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
    </Modal>
  );
}
