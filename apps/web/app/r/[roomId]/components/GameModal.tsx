"use client";

import React from "react";

import { Modal } from "../../../components/Modal";
import { GamePanel, type GamePanelProps } from "./GamePanel";
import { CupGamePanel, type CupGamePanelProps } from "./cupGame/CupGamePanel";

const GAME_TITLES: Record<string, string> = {
  "guess-it": "Guess It!",
  "cup-spider": "Cup Spider",
};

const GAME_EMOJIS: Record<string, string> = {
  "guess-it": "🎮",
  "cup-spider": "🥤",
};

export function GameModal({
  openGameId,
  onClose,
  gameProps,
  cupGameProps,
}: {
  openGameId: string | null;
  onClose: () => void;
  gameProps: GamePanelProps;
  cupGameProps: CupGamePanelProps;
}) {
  if (!openGameId) return null;

  const title = GAME_TITLES[openGameId] ?? "Game";
  const emoji = GAME_EMOJIS[openGameId] ?? "🎮";
  const titleId = "game-modal-title";

  const guessActive = gameProps.gameState.games.some((g) => g.status === "active");
  const cupActive = cupGameProps.cupGameState.games.some(
    (g) => g.session.status === "playing" || g.session.status === "placing",
  );
  const showActiveBadge =
    (openGameId === "guess-it" && guessActive) ||
    (openGameId === "cup-spider" && cupActive);

  return (
    <Modal
      open={openGameId !== null}
      onClose={onClose}
      labelledBy={titleId}
      panelClassName="relative z-10 w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl border border-white/10 bg-slate-900/95 backdrop-blur-xl shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden>
            {emoji}
          </span>
          <div>
            <h2 id={titleId} className="text-lg font-bold text-slate-100">
              {title}
            </h2>
            {showActiveBadge && (
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
        {openGameId === "cup-spider" && <CupGamePanel {...cupGameProps} />}
      </div>
    </Modal>
  );
}
