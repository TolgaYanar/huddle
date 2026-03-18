"use client";

import React, { useState } from "react";
import type { GameStateData } from "shared-logic";

const CATEGORIES = [
  "Brands",
  "People",
  "Places",
  "Movies & TV",
  "Music",
  "Sports",
  "Animals",
  "Things",
  "Other",
];

// ─── Setup Form ──────────────────────────────────────────────────────────────

function GameSetupForm({
  onStart,
  onCancel,
}: {
  onStart: (category: string, answer: string, images: string[]) => void;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState("Brands");
  const [answer, setAnswer] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [imageError, setImageError] = useState("");

  const addImage = () => {
    const url = imageUrl.trim();
    if (!url.startsWith("http")) {
      setImageError("Please enter a valid URL starting with http");
      return;
    }
    if (images.length >= 5) {
      setImageError("Maximum 5 images allowed");
      return;
    }
    setImages((prev) => [...prev, url]);
    setImageUrl("");
    setImageError("");
  };

  const removeImage = (i: number) =>
    setImages((prev) => prev.filter((_, idx) => idx !== i));

  const canStart = answer.trim().length > 0 && images.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm font-semibold text-slate-200">
        Set up a round
      </div>

      {/* Category */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400">Category</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/25"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Answer */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400">
          Answer{" "}
          <span className="text-slate-500">(hidden from others)</span>
        </label>
        <input
          type="text"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="e.g. Apple, Elon Musk, Tokyo…"
          maxLength={100}
          className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/25"
        />
      </div>

      {/* Images */}
      <div className="flex flex-col gap-2">
        <label className="text-xs text-slate-400">
          Clue images{" "}
          <span className="text-slate-500">
            ({images.length}/5 — paste image URLs)
          </span>
        </label>

        {images.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {images.map((url, i) => (
              <div key={i} className="relative group aspect-square">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`Clue ${i + 1}`}
                  className="w-full h-full object-cover rounded-lg border border-white/10"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Crect width='60' height='60' fill='%23334155'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-size='10'%3E?%3C/text%3E%3C/svg%3E";
                  }}
                />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-slate-300 text-xs hidden group-hover:flex items-center justify-center hover:bg-rose-600"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {images.length < 5 && (
          <div className="flex gap-2">
            <input
              type="text"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addImage()}
              placeholder="https://example.com/image.jpg"
              className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/25"
            />
            <button
              type="button"
              onClick={addImage}
              className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-slate-200 text-xs hover:bg-white/10 transition-colors"
            >
              Add
            </button>
          </div>
        )}
        {imageError && (
          <p className="text-xs text-rose-400">{imageError}</p>
        )}
        <p className="text-xs text-slate-500">
          Tip: right-click any image on the web → "Copy image address"
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2 rounded-xl border border-white/10 bg-white/5 text-slate-300 text-sm hover:bg-white/10 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canStart}
          onClick={() => onStart(category, answer.trim(), images)}
          className="flex-1 py-2 rounded-xl border border-white/10 bg-sky-600 text-white text-sm font-semibold hover:bg-sky-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Start game
        </button>
      </div>
    </div>
  );
}

// ─── Answer blanks display ────────────────────────────────────────────────────

function AnswerBlanks({ masked }: { masked: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 justify-center py-2">
      {masked.map((ch, i) =>
        ch === " " ? (
          <span key={i} className="w-3" />
        ) : (
          <span
            key={i}
            className={`inline-flex items-center justify-center w-7 h-9 border-b-2 text-base font-bold
              ${ch === "_" ? "border-slate-500 text-transparent" : "border-sky-400 text-sky-200"}`}
          >
            {ch === "_" ? "_" : ch.toUpperCase()}
          </span>
        ),
      )}
    </div>
  );
}

// ─── Active game ──────────────────────────────────────────────────────────────

function ActiveGame({
  gameState,
  mySocketId,
  isMyTurn,
  amQuestioner,
  guessInput,
  setGuessInput,
  onSubmitGuess,
  onRevealHint,
  onSkipTurn,
  onEndGame,
}: {
  gameState: GameStateData;
  mySocketId: string;
  isMyTurn: boolean;
  amQuestioner: boolean;
  guessInput: string;
  setGuessInput: (v: string) => void;
  onSubmitGuess: (e: React.FormEvent) => void;
  onRevealHint: () => void;
  onSkipTurn: () => void;
  onEndGame: () => void;
}) {
  const currentTurnUsername =
    gameState.currentTurnSocketId &&
    gameState.turnOrderUsernames?.[gameState.currentTurnSocketId];

  const turnLabel = isMyTurn
    ? "Your turn to guess!"
    : amQuestioner
      ? `Waiting for ${currentTurnUsername ?? "a player"} to guess…`
      : `${currentTurnUsername ?? "Someone"}'s turn`;

  const iAmWinner = gameState.winners?.includes(mySocketId);

  return (
    <div className="flex flex-col gap-3">
      {/* Category + questioner */}
      <div className="flex items-center justify-between">
        <span className="text-xs px-2 py-1 rounded-lg bg-sky-600/20 text-sky-300 border border-sky-600/30 font-medium">
          {gameState.category}
        </span>
        <span className="text-xs text-slate-500">
          by {gameState.questionerName ?? "Unknown"}
        </span>
      </div>

      {/* Images */}
      {gameState.images && gameState.images.length > 0 && (
        <div
          className={`grid gap-2 ${
            gameState.images.length === 1
              ? "grid-cols-1"
              : gameState.images.length <= 4
                ? "grid-cols-2"
                : "grid-cols-3"
          }`}
        >
          {gameState.images.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={url}
              alt={`Clue ${i + 1}`}
              className="w-full aspect-square object-cover rounded-xl border border-white/10"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Crect width='60' height='60' fill='%23334155'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-size='10'%3ENo image%3C/text%3E%3C/svg%3E";
              }}
            />
          ))}
        </div>
      )}

      {/* Answer blanks */}
      {gameState.answerMasked && (
        <AnswerBlanks masked={gameState.answerMasked} />
      )}

      {/* Hints info */}
      {(gameState.hintsRevealed ?? 0) > 0 && (
        <p className="text-center text-xs text-amber-400">
          {gameState.hintsRevealed} hint
          {gameState.hintsRevealed === 1 ? "" : "s"} revealed
        </p>
      )}

      {/* Turn indicator */}
      <div
        className={`text-center text-sm font-medium py-1 rounded-lg ${
          isMyTurn
            ? "bg-sky-600/20 text-sky-300"
            : iAmWinner
              ? "bg-emerald-600/20 text-emerald-300"
              : "text-slate-400"
        }`}
      >
        {iAmWinner ? "You guessed it! Waiting for others…" : turnLabel}
      </div>

      {/* Guess input — players only, on their turn */}
      {!amQuestioner && isMyTurn && !iAmWinner && (
        <form onSubmit={onSubmitGuess} className="flex gap-2">
          <input
            type="text"
            value={guessInput}
            onChange={(e) => setGuessInput(e.target.value)}
            placeholder="Your answer…"
            autoFocus
            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/25"
          />
          <button
            type="submit"
            disabled={!guessInput.trim()}
            className="px-3 py-2 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-500 transition-colors disabled:opacity-50"
          >
            Guess
          </button>
        </form>
      )}

      {/* Questioner controls */}
      {amQuestioner && (
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={onRevealHint}
            className="flex-1 py-2 rounded-xl border border-amber-500/30 bg-amber-600/10 text-amber-300 text-xs font-medium hover:bg-amber-600/20 transition-colors"
          >
            Reveal a letter
          </button>
          <button
            type="button"
            onClick={onSkipTurn}
            className="flex-1 py-2 rounded-xl border border-white/10 bg-white/5 text-slate-300 text-xs hover:bg-white/10 transition-colors"
          >
            Skip turn
          </button>
          <button
            type="button"
            onClick={onEndGame}
            className="w-full py-2 rounded-xl border border-rose-500/30 bg-rose-600/10 text-rose-300 text-xs font-medium hover:bg-rose-600/20 transition-colors"
          >
            End game (reveal answer)
          </button>
        </div>
      )}

      {/* Recent guesses */}
      {gameState.guesses && gameState.guesses.length > 0 && (
        <div className="flex flex-col gap-1 pt-1">
          <div className="text-xs text-slate-500 font-medium">Guesses</div>
          <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
            {[...gameState.guesses].reverse().map((g, i) => (
              <div
                key={i}
                className={`flex items-center justify-between text-xs px-2 py-1 rounded-lg ${
                  g.correct
                    ? "bg-emerald-600/15 border border-emerald-600/20"
                    : "bg-white/5 border border-white/5"
                }`}
              >
                <span className="text-slate-400">
                  {g.username ?? "Unknown"}
                </span>
                <span
                  className={g.correct ? "text-emerald-300" : "text-slate-300"}
                >
                  {g.guess}
                  {g.correct && " ✓"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Finished game ────────────────────────────────────────────────────────────

function FinishedGame({
  gameState,
  amQuestioner,
  onReset,
}: {
  gameState: GameStateData;
  amQuestioner: boolean;
  onReset: () => void;
}) {
  const hasWinners = (gameState.winnerUsernames?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-4 items-center text-center">
      <div className="text-2xl">🎉</div>

      <div>
        <div className="text-xs text-slate-500 mb-1">The answer was</div>
        <div className="text-xl font-bold text-sky-300">
          {gameState.answer ?? gameState.answerMasked?.join("")}
        </div>
      </div>

      {hasWinners ? (
        <div>
          <div className="text-xs text-slate-500 mb-1">
            {gameState.winnerUsernames!.length === 1 ? "Winner" : "Winners"}
          </div>
          <div className="flex flex-wrap gap-2 justify-center">
            {gameState.winnerUsernames!.map((w) => (
              <span
                key={w.socketId}
                className="px-3 py-1 rounded-full bg-emerald-600/20 text-emerald-300 text-sm border border-emerald-600/30"
              >
                {w.username ?? "Unknown"}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-sm text-slate-400">Nobody guessed it!</div>
      )}

      {/* All guesses summary */}
      {gameState.guesses && gameState.guesses.length > 0 && (
        <div className="w-full flex flex-col gap-1">
          <div className="text-xs text-slate-500 font-medium">All guesses</div>
          <div className="flex flex-col gap-1 max-h-32 overflow-y-auto w-full">
            {[...gameState.guesses].reverse().map((g, i) => (
              <div
                key={i}
                className={`flex items-center justify-between text-xs px-2 py-1 rounded-lg ${
                  g.correct
                    ? "bg-emerald-600/15 border border-emerald-600/20"
                    : "bg-white/5 border border-white/5"
                }`}
              >
                <span className="text-slate-400">
                  {g.username ?? "Unknown"}
                </span>
                <span
                  className={g.correct ? "text-emerald-300" : "text-slate-300"}
                >
                  {g.guess}
                  {g.correct && " ✓"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {amQuestioner && (
        <button
          type="button"
          onClick={onReset}
          className="w-full py-2 rounded-xl border border-white/10 bg-sky-600/20 text-sky-300 text-sm font-semibold hover:bg-sky-600/30 transition-colors"
        >
          Play again
        </button>
      )}
    </div>
  );
}

// ─── Main GamePanel ───────────────────────────────────────────────────────────

export type GamePanelProps = {
  gameState: GameStateData;
  mySocketId: string;
  isMyTurn: boolean;
  amQuestioner: boolean;
  guessInput: string;
  setGuessInput: (v: string) => void;
  isSetupOpen: boolean;
  setIsSetupOpen: (v: boolean) => void;
  handleSubmitGuess: (e: React.FormEvent) => void;
  handleStartGame: (category: string, answer: string, images: string[]) => void;
  revealHint: () => void;
  skipTurn: () => void;
  endGame: () => void;
  resetGame: () => void;
};

export function GamePanel({
  gameState,
  mySocketId,
  isMyTurn,
  amQuestioner,
  guessInput,
  setGuessInput,
  isSetupOpen,
  setIsSetupOpen,
  handleSubmitGuess,
  handleStartGame,
  revealHint,
  skipTurn,
  endGame,
  resetGame,
}: GamePanelProps) {
  if (gameState.status === "idle") {
    return (
      <div className="flex flex-col gap-4">
        {isSetupOpen ? (
          <GameSetupForm
            onStart={handleStartGame}
            onCancel={() => setIsSetupOpen(false)}
          />
        ) : (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="text-3xl">🎮</div>
            <div className="text-slate-300 text-sm font-medium">
              Guess It!
            </div>
            <div className="text-slate-500 text-xs leading-relaxed max-w-[200px]">
              Post clue images, others guess the answer turn by turn. Reveal
              hints letter by letter if they&apos;re stuck.
            </div>
            <button
              type="button"
              onClick={() => setIsSetupOpen(true)}
              className="px-5 py-2 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-500 transition-colors"
            >
              Start a game
            </button>
          </div>
        )}
      </div>
    );
  }

  if (gameState.status === "finished") {
    return (
      <FinishedGame
        gameState={gameState}
        amQuestioner={amQuestioner}
        onReset={resetGame}
      />
    );
  }

  return (
    <ActiveGame
      gameState={gameState}
      mySocketId={mySocketId}
      isMyTurn={isMyTurn}
      amQuestioner={amQuestioner}
      guessInput={guessInput}
      setGuessInput={setGuessInput}
      onSubmitGuess={handleSubmitGuess}
      onRevealHint={revealHint}
      onSkipTurn={skipTurn}
      onEndGame={endGame}
    />
  );
}
