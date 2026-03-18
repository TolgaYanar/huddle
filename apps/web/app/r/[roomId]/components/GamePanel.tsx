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
  onStart: (
    category: string,
    answer: string,
    images: string[],
    hideBlanks: boolean,
  ) => void;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState("Brands");
  const [answer, setAnswer] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [imageError, setImageError] = useState("");
  const [hideBlanks, setHideBlanks] = useState(false);

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
    <div className="flex flex-col gap-6">
      <div className="text-base font-semibold text-slate-100">
        Set up a round
      </div>

      {/* Top row — category + answer side by side */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-400">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Category"
            className="bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/25"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-400">
            Answer{" "}
            <span className="text-slate-600 font-normal">(only you see this)</span>
          </label>
          <input
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="e.g. Apple, Picasso, Tokyo…"
            maxLength={100}
            className="bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/25"
          />
        </div>
      </div>

      {/* Hide blanks toggle */}
      <label className="flex items-start gap-3 cursor-pointer group">
        <div className="relative mt-0.5 shrink-0">
          <input
            type="checkbox"
            checked={hideBlanks}
            onChange={(e) => setHideBlanks(e.target.checked)}
            className="sr-only"
          />
          <div
            className={`w-10 h-6 rounded-full border transition-colors ${
              hideBlanks
                ? "bg-sky-600 border-sky-500"
                : "bg-white/10 border-white/20"
            }`}
          >
            <div
              className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                hideBlanks ? "translate-x-5" : "translate-x-1"
              }`}
            />
          </div>
        </div>
        <div>
          <div className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors">
            Hide letter count
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Players won't see blanks until you reveal the first hint
          </div>
        </div>
      </label>

      {/* Images */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-slate-400">
            Clue images
          </label>
          <span className="text-xs text-slate-600">{images.length} / 5</span>
        </div>

        {images.length > 0 && (
          <div className="grid grid-cols-5 gap-2">
            {images.map((url, i) => (
              <div key={i} className="relative group aspect-square">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`Clue ${i + 1}`}
                  className="w-full h-full object-cover rounded-xl border border-white/10"
                  onError={(e) => {
                    (
                      e.target as HTMLImageElement
                    ).src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Crect width='60' height='60' fill='%23334155'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-size='9'%3ENo image%3C/text%3E%3C/svg%3E`;
                  }}
                />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity text-slate-200 text-xl font-bold"
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
              placeholder="Paste an image URL (https://…)"
              className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/25"
            />
            <button
              type="button"
              onClick={addImage}
              className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-slate-200 text-sm hover:bg-white/10 transition-colors"
            >
              Add
            </button>
          </div>
        )}
        {imageError && (
          <p className="text-xs text-rose-400">{imageError}</p>
        )}
        <p className="text-xs text-slate-600">
          Tip: right-click any image on the web → "Copy image address"
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl border border-white/10 bg-white/5 text-slate-300 text-sm hover:bg-white/10 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canStart}
          onClick={() => onStart(category, answer.trim(), images, hideBlanks)}
          className="flex-1 py-2.5 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Start round
        </button>
      </div>
    </div>
  );
}

// ─── Answer blanks display ────────────────────────────────────────────────────

function AnswerBlanks({
  masked,
  hidden,
}: {
  masked?: string[];
  hidden: boolean;
}) {
  if (hidden || !masked) {
    return (
      <div className="flex items-center justify-center py-4">
        <span className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-500 text-sm">
          Answer hidden — wait for hints
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5 justify-center py-3">
      {masked.map((ch, i) =>
        ch === " " ? (
          <span key={i} className="w-4" />
        ) : (
          <span
            key={i}
            className={`inline-flex items-center justify-center w-8 h-10 border-b-2 text-lg font-bold
              ${ch === "_" ? "border-slate-600 text-transparent select-none" : "border-sky-400 text-sky-200"}`}
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
  const blanksHidden =
    gameState.hideBlanks && (gameState.hintsRevealed ?? 0) === 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Category + questioner */}
      <div className="flex items-center justify-between">
        <span className="text-xs px-2.5 py-1 rounded-lg bg-sky-600/20 text-sky-300 border border-sky-600/30 font-medium">
          {gameState.category}
        </span>
        <span className="text-xs text-slate-500">
          round by{" "}
          <span className="text-slate-400">
            {gameState.questionerName ?? "Unknown"}
          </span>
        </span>
      </div>

      {/* Images — larger grid in modal */}
      {gameState.images && gameState.images.length > 0 && (
        <div
          className={`grid gap-3 ${
            gameState.images.length === 1
              ? "grid-cols-1 max-w-xs mx-auto w-full"
              : gameState.images.length === 2
                ? "grid-cols-2"
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
              className="w-full aspect-square object-cover rounded-2xl border border-white/10"
              onError={(e) => {
                (
                  e.target as HTMLImageElement
                ).src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Crect width='60' height='60' fill='%23334155'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-size='10'%3ENo image%3C/text%3E%3C/svg%3E`;
              }}
            />
          ))}
        </div>
      )}

      {/* Answer blanks */}
      <AnswerBlanks
        masked={gameState.answerMasked}
        hidden={!!blanksHidden && !amQuestioner}
      />

      {/* Questioner sees blanks always */}
      {amQuestioner && blanksHidden && (
        <p className="text-center text-xs text-amber-400/70">
          Players see "Answer hidden" until you reveal a hint
        </p>
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
        className={`text-center text-sm font-medium py-2 rounded-xl ${
          isMyTurn
            ? "bg-sky-600/20 text-sky-300"
            : iAmWinner
              ? "bg-emerald-600/20 text-emerald-300"
              : "bg-white/5 text-slate-400"
        }`}
      >
        {iAmWinner ? "You guessed it! Waiting for others…" : turnLabel}
      </div>

      {/* Guess input */}
      {!amQuestioner && isMyTurn && !iAmWinner && (
        <form onSubmit={onSubmitGuess} className="flex gap-2">
          <input
            type="text"
            value={guessInput}
            onChange={(e) => setGuessInput(e.target.value)}
            placeholder="Your answer…"
            autoFocus
            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/25"
          />
          <button
            type="submit"
            disabled={!guessInput.trim()}
            className="px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-500 transition-colors disabled:opacity-50"
          >
            Guess
          </button>
        </form>
      )}

      {/* Questioner controls */}
      {amQuestioner && (
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={onRevealHint}
            className="py-2.5 rounded-xl border border-amber-500/30 bg-amber-600/10 text-amber-300 text-sm font-medium hover:bg-amber-600/20 transition-colors"
          >
            Reveal a letter
          </button>
          <button
            type="button"
            onClick={onSkipTurn}
            className="py-2.5 rounded-xl border border-white/10 bg-white/5 text-slate-300 text-sm hover:bg-white/10 transition-colors"
          >
            Skip turn
          </button>
          <button
            type="button"
            onClick={onEndGame}
            className="col-span-2 py-2.5 rounded-xl border border-rose-500/30 bg-rose-600/10 text-rose-300 text-sm font-medium hover:bg-rose-600/20 transition-colors"
          >
            End game (reveal answer)
          </button>
        </div>
      )}

      {/* Recent guesses */}
      {gameState.guesses && gameState.guesses.length > 0 && (
        <div className="flex flex-col gap-2 pt-1">
          <div className="text-xs text-slate-500 font-medium">Guesses</div>
          <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
            {[...gameState.guesses].reverse().map((g, i) => (
              <div
                key={i}
                className={`flex items-center justify-between text-sm px-3 py-1.5 rounded-xl ${
                  g.correct
                    ? "bg-emerald-600/15 border border-emerald-600/20"
                    : "bg-white/5 border border-white/5"
                }`}
              >
                <span className="text-slate-400">
                  {g.username ?? "Unknown"}
                </span>
                <span
                  className={g.correct ? "text-emerald-300 font-medium" : "text-slate-300"}
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
  onReset,
}: {
  gameState: GameStateData;
  onReset: () => void;
}) {
  const hasWinners = (gameState.winnerUsernames?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-6 items-center text-center py-4">
      <div className="text-4xl">🎉</div>

      <div>
        <div className="text-xs text-slate-500 mb-2">The answer was</div>
        <div className="text-3xl font-bold text-sky-300">
          {gameState.answer ?? gameState.answerMasked?.join("")}
        </div>
      </div>

      {hasWinners ? (
        <div>
          <div className="text-xs text-slate-500 mb-2">
            {gameState.winnerUsernames!.length === 1 ? "Winner" : "Winners 🏆"}
          </div>
          <div className="flex flex-wrap gap-2 justify-center">
            {gameState.winnerUsernames!.map((w) => (
              <span
                key={w.socketId}
                className="px-4 py-1.5 rounded-full bg-emerald-600/20 text-emerald-300 text-sm font-medium border border-emerald-600/30"
              >
                {w.username ?? "Unknown"}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-slate-400">Nobody guessed it!</div>
      )}

      {gameState.guesses && gameState.guesses.length > 0 && (
        <div className="w-full flex flex-col gap-2">
          <div className="text-xs text-slate-500 font-medium">All guesses</div>
          <div className="flex flex-col gap-1 max-h-40 overflow-y-auto w-full">
            {[...gameState.guesses].reverse().map((g, i) => (
              <div
                key={i}
                className={`flex items-center justify-between text-sm px-3 py-1.5 rounded-xl ${
                  g.correct
                    ? "bg-emerald-600/15 border border-emerald-600/20"
                    : "bg-white/5 border border-white/5"
                }`}
              >
                <span className="text-slate-400">
                  {g.username ?? "Unknown"}
                </span>
                <span
                  className={g.correct ? "text-emerald-300 font-medium" : "text-slate-300"}
                >
                  {g.guess}
                  {g.correct && " ✓"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Anyone can start a new round */}
      <button
        type="button"
        onClick={onReset}
        className="px-8 py-3 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-500 transition-colors"
      >
        Start next round
      </button>
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
  handleStartGame: (
    category: string,
    answer: string,
    images: string[],
    hideBlanks: boolean,
  ) => void;
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
          <div className="flex flex-col items-center gap-5 py-10 text-center">
            <div className="text-5xl">🔍</div>
            <div>
              <div className="text-lg font-bold text-slate-100">Guess It!</div>
              <div className="text-sm text-slate-500 mt-1 max-w-xs leading-relaxed">
                Post clue images, others guess turn by turn. Reveal hints letter
                by letter if they&apos;re stuck.
              </div>
            </div>
            {/* Anyone can start a round */}
            <button
              type="button"
              onClick={() => setIsSetupOpen(true)}
              className="px-8 py-3 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-500 transition-colors"
            >
              Start a round
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
