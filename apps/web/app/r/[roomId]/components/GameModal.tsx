"use client";

import dynamic from "next/dynamic";
import React from "react";

import { Modal } from "../../../components/Modal";
import type { GamePanelProps } from "./GamePanel";
import type { CupGamePanelProps } from "./cupGame/CupGamePanel";

// GamePanel (~2k lines) and CupGamePanel (~1.3k lines, which also pulls in the
// canvas-based ImageEditor) were statically imported, so every member of every
// room downloaded and parsed all of it on first paint — including the majority
// who never open a game. Both already render behind `openGameId`, so splitting
// them out costs nothing but a short loading state on first open.
//
// `ssr: false` is safe here: GameModal is a client component that returns null
// until a game is opened, so these never render on the server anyway.
const GamePanel = dynamic(
  () => import("./GamePanel").then((m) => m.GamePanel),
  { ssr: false, loading: () => <GameLoading /> },
);

const CupGamePanel = dynamic(
  () => import("./cupGame/CupGamePanel").then((m) => m.CupGamePanel),
  { ssr: false, loading: () => <GameLoading /> },
);

function GameLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center py-16 text-sm text-ink-muted"
    >
      Loading game…
    </div>
  );
}

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

  const guessActive = gameProps.gameState.games.some(
    (g) => g.status === "active",
  );
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
      panelClassName="relative z-10 w-full max-w-5xl max-h-[92vh] flex flex-col panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-hairline shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden>
            {emoji}
          </span>
          <div>
            <h2 id={titleId} className="text-lg font-bold text-ink">
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
          className="h-9 w-9 rounded-[var(--radius-control)] border border-hairline bg-surface text-ink-muted hover:text-ink hover:bg-raised transition-colors inline-flex items-center justify-center text-lg"
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
