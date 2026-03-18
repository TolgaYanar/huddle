"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { GameRound, GameRoundInput, GameStateData } from "shared-logic";

const CATEGORIES = [
  "Brands", "People", "Places", "Movies & TV",
  "Music", "Sports", "Animals", "Things", "Other",
];

// ─── Image Result Cell ────────────────────────────────────────────────────────

function ImageResultCell({
  img,
  selected,
  onSelect,
}: {
  img: ImageResult;
  selected: boolean;
  onSelect: () => void;
}) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  return (
    <button
      type="button"
      onClick={onSelect}
      title={img.title}
      className={`group relative flex items-center justify-center h-24 rounded-xl overflow-hidden border-2 transition-colors bg-white ${
        selected ? "border-sky-400" : "border-transparent hover:border-sky-400/50"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img.thumbnail}
        alt={img.title}
        className="max-w-full max-h-full w-auto h-auto object-contain p-2"
        onError={() => setHidden(true)}
      />
      {/* Hover title overlay */}
      <div className="absolute bottom-0 inset-x-0 bg-black/70 px-1.5 py-0.5 translate-y-full group-hover:translate-y-0 transition-transform">
        <p className="text-[10px] text-slate-200 truncate">{img.title}</p>
      </div>
      {selected && (
        <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-sky-500 flex items-center justify-center shadow-md">
          <span className="text-white text-[10px] font-bold">✓</span>
        </div>
      )}
    </button>
  );
}

// ─── Image Picker ─────────────────────────────────────────────────────────────

interface ImageResult {
  url: string;
  thumbnail: string;
  title: string;
}

function ImagePicker({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (url: string) => void;
}) {
  const [tab, setTab] = useState<"search" | "url">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ImageResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [error, setError] = useState("");

  const search = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/image-search?q=${encodeURIComponent(query.trim())}`,
      );
      const data = (await res.json()) as {
        images: ImageResult[];
        error?: string;
      };
      if (data.error) setError("Search failed — try a different query or paste a URL");
      setResults(data.images ?? []);
    } catch {
      setError("Search failed — try a different query or paste a URL");
    } finally {
      setLoading(false);
    }
  }, [query]);

  const applyUrl = () => {
    const url = urlInput.trim();
    if (!url.startsWith("http")) {
      setError("Please enter a valid URL starting with http");
      return;
    }
    onSelect(url);
    setError("");
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Tab switcher */}
      <div className="flex gap-1 bg-black/30 p-1 rounded-xl">
        {(["search", "url"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setTab(t); setError(""); }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === t
                ? "bg-white/10 text-slate-100"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {t === "search" ? "Search web" : "Paste URL"}
          </button>
        ))}
      </div>

      {tab === "search" && (
        <>
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder="e.g. Apple logo, Eiffel Tower…"
              className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/25"
            />
            <button
              type="button"
              onClick={search}
              disabled={loading || !query.trim()}
              className="px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-medium hover:bg-sky-500 transition-colors disabled:opacity-50"
            >
              {loading ? "…" : "Search"}
            </button>
          </div>

          {error && <p className="text-xs text-rose-400">{error}</p>}

          {results.length > 0 && (
            <div className="grid grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
              {results.map((img, i) => (
                <ImageResultCell
                  key={i}
                  img={img}
                  selected={selected === img.url}
                  onSelect={() => onSelect(img.url)}
                />
              ))}
            </div>
          )}

          {results.length === 0 && !loading && !error && (
            <p className="text-xs text-slate-600 text-center py-4">
              Search for images to use as a clue
            </p>
          )}
        </>
      )}

      {tab === "url" && (
        <>
          <div className="flex gap-2">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyUrl()}
              placeholder="https://example.com/image.jpg"
              className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/25"
            />
            <button
              type="button"
              onClick={applyUrl}
              disabled={!urlInput.trim()}
              className="px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-medium hover:bg-sky-500 transition-colors disabled:opacity-50"
            >
              Use
            </button>
          </div>
          {error && <p className="text-xs text-rose-400">{error}</p>}
          <p className="text-xs text-slate-600">
            Right-click any image on the web → "Copy image address"
          </p>
        </>
      )}

      {/* Selected image preview */}
      {selected && (
        <div className="flex items-center gap-3 p-2 rounded-xl bg-emerald-600/10 border border-emerald-600/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selected}
            alt="Selected"
            className="w-12 h-12 rounded-lg object-cover border border-white/10"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48'%3E%3Crect width='48' height='48' fill='%23334155'/%3E%3C/svg%3E";
            }}
          />
          <div className="flex-1 min-w-0">
            <div className="text-xs text-emerald-400 font-medium">Image selected ✓</div>
            <div className="text-xs text-slate-500 truncate">{selected}</div>
          </div>
          <button
            type="button"
            onClick={() => onSelect("")}
            className="text-slate-500 hover:text-slate-300 text-lg px-1"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Round card in setup ──────────────────────────────────────────────────────

function RoundCard({
  index,
  round,
  onChange,
  onRemove,
  canRemove,
}: {
  index: number;
  round: GameRoundInput;
  onChange: (round: GameRoundInput) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const [expanded, setExpanded] = useState(index === 0);

  const isValid = round.answer.trim().length > 0 && round.image.length > 0;

  return (
    <div className={`rounded-2xl border ${isValid ? "border-white/10" : "border-white/5"} bg-white/5 overflow-hidden`}>
      {/* Card header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
          isValid ? "bg-sky-600 text-white" : "bg-white/10 text-slate-400"
        }`}>
          {isValid ? "✓" : index + 1}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 text-left text-sm font-medium text-slate-200 hover:text-white transition-colors"
        >
          {round.answer.trim() || `Round ${index + 1}`}
          {round.category && (
            <span className="ml-2 text-xs text-slate-500 font-normal">
              {round.category}
            </span>
          )}
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-slate-500 hover:text-slate-300 px-1 text-sm transition-colors"
          >
            {expanded ? "▲" : "▼"}
          </button>
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="text-slate-600 hover:text-rose-400 px-1 text-lg transition-colors"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-4 border-t border-white/5 pt-4">
          {/* Category + answer */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-400">Category</label>
              <select
                value={round.category}
                onChange={(e) => onChange({ ...round, category: e.target.value })}
                aria-label="Category"
                className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/25"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-400">
                Answer <span className="text-slate-600 font-normal">(hidden)</span>
              </label>
              <input
                type="text"
                value={round.answer}
                onChange={(e) => onChange({ ...round, answer: e.target.value })}
                placeholder="e.g. Apple, Picasso…"
                maxLength={100}
                className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/25"
              />
            </div>
          </div>

          {/* Hide blanks */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative shrink-0">
              <input
                type="checkbox"
                checked={round.hideBlanks}
                onChange={(e) => onChange({ ...round, hideBlanks: e.target.checked })}
                className="sr-only"
              />
              <div className={`w-9 h-5 rounded-full border transition-colors ${round.hideBlanks ? "bg-sky-600 border-sky-500" : "bg-white/10 border-white/20"}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${round.hideBlanks ? "translate-x-4" : "translate-x-0.5"}`} />
              </div>
            </div>
            <span className="text-xs text-slate-400">Hide letter count until first hint</span>
          </label>

          {/* Image */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-400">Clue image</label>
            <ImagePicker
              selected={round.image}
              onSelect={(url) => onChange({ ...round, image: url })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Setup Form ──────────────────────────────────────────────────────────────

function GameSetupForm({
  onStart,
  onCancel,
}: {
  onStart: (rounds: GameRoundInput[]) => void;
  onCancel: () => void;
}) {
  const [rounds, setRounds] = useState<GameRoundInput[]>([
    { category: "Brands", answer: "", image: "", hideBlanks: false },
  ]);

  const addRound = () => {
    if (rounds.length >= 10) return;
    setRounds((prev) => [
      ...prev,
      { category: "Brands", answer: "", image: "", hideBlanks: false },
    ]);
  };

  const updateRound = (i: number, r: GameRoundInput) =>
    setRounds((prev) => prev.map((x, idx) => (idx === i ? r : x)));

  const removeRound = (i: number) =>
    setRounds((prev) => prev.filter((_, idx) => idx !== i));

  const validRounds = rounds.filter(
    (r) => r.answer.trim() && r.image,
  );
  const canStart = validRounds.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div className="text-base font-semibold text-slate-100">Set up rounds</div>
        <div className="text-xs text-slate-500">{validRounds.length}/{rounds.length} ready</div>
      </div>

      <div className="flex flex-col gap-3">
        {rounds.map((r, i) => (
          <RoundCard
            key={i}
            index={i}
            round={r}
            onChange={(updated) => updateRound(i, updated)}
            onRemove={() => removeRound(i)}
            canRemove={rounds.length > 1}
          />
        ))}
      </div>

      {rounds.length < 10 && (
        <button
          type="button"
          onClick={addRound}
          className="w-full py-3 rounded-2xl border border-dashed border-white/20 text-slate-400 text-sm hover:border-white/40 hover:text-slate-200 transition-colors"
        >
          + Add round
        </button>
      )}

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
          onClick={() => onStart(validRounds)}
          className="flex-1 py-2.5 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Start game ({validRounds.length} round{validRounds.length !== 1 ? "s" : ""})
        </button>
      </div>
    </div>
  );
}

// ─── Answer blanks ────────────────────────────────────────────────────────────

function AnswerBlanks({ masked, hidden }: { masked?: string[]; hidden: boolean }) {
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
    <div className="flex flex-wrap gap-2 justify-center py-3">
      {masked.map((ch, i) =>
        ch === " " ? (
          <span key={i} className="w-4" />
        ) : (
          <span
            key={i}
            className={`inline-flex items-center justify-center w-9 h-11 border-b-2 text-xl font-bold ${
              ch === "_"
                ? "border-slate-600 text-transparent select-none"
                : "border-sky-400 text-sky-200"
            }`}
          >
            {ch === "_" ? "_" : ch.toUpperCase()}
          </span>
        ),
      )}
    </div>
  );
}

// ─── Active round ─────────────────────────────────────────────────────────────

function ActiveRound({
  gameState,
  round,
  mySocketId,
  isMyTurn,
  amQuestioner,
  guessInput,
  setGuessInput,
  onSubmitGuess,
  onRevealHint,
  onSkipTurn,
  onEndRound,
  onEndGame,
}: {
  gameState: GameStateData;
  round: GameRound;
  mySocketId: string;
  isMyTurn: boolean;
  amQuestioner: boolean;
  guessInput: string;
  setGuessInput: (v: string) => void;
  onSubmitGuess: (e: React.FormEvent) => void;
  onRevealHint: () => void;
  onSkipTurn: () => void;
  onEndRound: () => void;
  onEndGame: () => void;
}) {
  const currentTurnUsername =
    gameState.currentTurnSocketId &&
    gameState.turnOrderUsernames?.[gameState.currentTurnSocketId];

  const iAmWinner = round.winners?.includes(mySocketId);
  const blanksHidden =
    round.hideBlanks && (round.hintsRevealed ?? 0) === 0 && !amQuestioner;

  return (
    <div className="flex flex-col gap-4">
      {/* Round indicator + category */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-400">
            Round {(gameState.currentRoundIndex ?? 0) + 1} of {gameState.totalRounds}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-lg bg-sky-600/20 text-sky-300 border border-sky-600/30">
            {round.category}
          </span>
        </div>
        <span className="text-xs text-slate-600">
          by {gameState.questionerName ?? "Unknown"}
        </span>
      </div>

      {/* Single clue image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={round.image}
        alt="Clue"
        className="w-full max-h-72 object-contain rounded-2xl border border-white/10 bg-black/20"
        onError={(e) => {
          (e.target as HTMLImageElement).src =
            "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%23334155'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-size='14'%3ENo image%3C/text%3E%3C/svg%3E";
        }}
      />

      {/* Blanks */}
      <AnswerBlanks masked={round.answerMasked} hidden={blanksHidden} />

      {amQuestioner && round.hideBlanks && round.hintsRevealed === 0 && (
        <p className="text-center text-xs text-amber-400/60">
          Players see "Answer hidden" until first hint
        </p>
      )}

      {(round.hintsRevealed ?? 0) > 0 && (
        <p className="text-center text-xs text-amber-400">
          {round.hintsRevealed} hint{round.hintsRevealed === 1 ? "" : "s"} revealed
        </p>
      )}

      {/* Turn indicator */}
      <div className={`text-center text-sm font-medium py-2 rounded-xl ${
        isMyTurn ? "bg-sky-600/20 text-sky-300"
          : iAmWinner ? "bg-emerald-600/20 text-emerald-300"
          : "bg-white/5 text-slate-400"
      }`}>
        {iAmWinner
          ? "You guessed it! Waiting for others…"
          : isMyTurn
          ? "Your turn to guess!"
          : amQuestioner
          ? `Waiting for ${currentTurnUsername ?? "a player"} to guess…`
          : `${currentTurnUsername ?? "Someone"}'s turn`}
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
        <div className="grid grid-cols-2 gap-2">
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
            onClick={onEndRound}
            className="col-span-2 py-2.5 rounded-xl border border-rose-500/30 bg-rose-600/10 text-rose-300 text-sm font-medium hover:bg-rose-600/20 transition-colors"
          >
            End round (reveal answer)
          </button>
        </div>
      )}

      {/* Recent guesses */}
      {round.guesses.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-xs text-slate-500 font-medium">Guesses</div>
          <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
            {[...round.guesses].reverse().map((g, i) => (
              <div
                key={i}
                className={`flex items-center justify-between text-sm px-3 py-1.5 rounded-xl ${
                  g.correct
                    ? "bg-emerald-600/15 border border-emerald-600/20"
                    : "bg-white/5 border border-white/5"
                }`}
              >
                <span className="text-slate-400">{g.username ?? "Unknown"}</span>
                <span className={g.correct ? "text-emerald-300 font-medium" : "text-slate-300"}>
                  {g.guess}{g.correct && " ✓"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Round results ────────────────────────────────────────────────────────────

function RoundResults({
  gameState,
  round,
  amQuestioner,
  onNextRound,
}: {
  gameState: GameStateData;
  round: GameRound;
  amQuestioner: boolean;
  onNextRound: () => void;
}) {
  const isLastRound =
    (gameState.currentRoundIndex ?? 0) >= (gameState.totalRounds ?? 1) - 1;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Round {(gameState.currentRoundIndex ?? 0) + 1} of {gameState.totalRounds}</span>
        <span className="px-2 py-0.5 rounded-lg bg-white/5">{round.category}</span>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={round.image}
        alt="Clue"
        className="w-full max-h-52 object-contain rounded-2xl border border-white/10 bg-black/20"
        onError={(e) => {
          (e.target as HTMLImageElement).style.opacity = "0.3";
        }}
      />

      <div className="text-center">
        <div className="text-xs text-slate-500 mb-1">Answer</div>
        <div className="text-2xl font-bold text-sky-300">{round.answer}</div>
      </div>

      {round.winnerUsernames.length > 0 ? (
        <div className="flex flex-wrap gap-2 justify-center">
          {round.winnerUsernames.map((w) => (
            <span
              key={w.socketId}
              className="px-3 py-1 rounded-full bg-emerald-600/20 text-emerald-300 text-sm border border-emerald-600/30"
            >
              {w.username ?? "Unknown"} ✓
            </span>
          ))}
        </div>
      ) : (
        <div className="text-center text-sm text-slate-500">Nobody guessed it</div>
      )}

      {round.guesses.length > 0 && (
        <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
          {[...round.guesses].reverse().map((g, i) => (
            <div
              key={i}
              className={`flex items-center justify-between text-sm px-3 py-1.5 rounded-xl ${
                g.correct
                  ? "bg-emerald-600/15 border border-emerald-600/20"
                  : "bg-white/5 border border-white/5"
              }`}
            >
              <span className="text-slate-400">{g.username ?? "Unknown"}</span>
              <span className={g.correct ? "text-emerald-300 font-medium" : "text-slate-300"}>
                {g.guess}{g.correct && " ✓"}
              </span>
            </div>
          ))}
        </div>
      )}

      {amQuestioner && !isLastRound && (
        <button
          type="button"
          onClick={onNextRound}
          className="w-full py-3 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-500 transition-colors"
        >
          Next round →
        </button>
      )}

      {!amQuestioner && !isLastRound && (
        <p className="text-center text-xs text-slate-500">
          Waiting for {gameState.questionerName ?? "the questioner"} to start next round…
        </p>
      )}
    </div>
  );
}

// ─── Final scoreboard ─────────────────────────────────────────────────────────

function FinalScoreboard({
  gameState,
  onReset,
}: {
  gameState: GameStateData;
  onReset: () => void;
}) {
  const scores = Object.entries(gameState.scoreboard ?? {}).sort(
    ([, a], [, b]) => b.wins - a.wins,
  );

  return (
    <div className="flex flex-col gap-6 py-2">
      <div className="text-center">
        <div className="text-4xl mb-2">🏆</div>
        <div className="text-xl font-bold text-slate-100">Game over!</div>
        <div className="text-sm text-slate-500 mt-1">
          {gameState.totalRounds} round{gameState.totalRounds !== 1 ? "s" : ""} completed
        </div>
      </div>

      {scores.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">Scoreboard</div>
          {scores.map(([socketId, entry], i) => (
            <div
              key={socketId}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                i === 0
                  ? "bg-amber-600/10 border-amber-500/30"
                  : "bg-white/5 border-white/5"
              }`}
            >
              <span className="text-lg">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`}</span>
              <span className="flex-1 font-medium text-slate-200">
                {entry.username ?? "Unknown"}
              </span>
              <span className={`text-sm font-bold ${i === 0 ? "text-amber-300" : "text-slate-400"}`}>
                {entry.wins} / {gameState.totalRounds}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center text-slate-500">Nobody scored any points!</div>
      )}

      <button
        type="button"
        onClick={onReset}
        className="w-full py-3 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-500 transition-colors"
      >
        Start new game
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
  handleStartGame: (rounds: GameRoundInput[]) => void;
  revealHint: () => void;
  skipTurn: () => void;
  endRound: () => void;
  nextRound: () => void;
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
  endRound,
  nextRound,
  resetGame,
}: GamePanelProps) {
  // Idle
  if (gameState.status === "idle") {
    if (isSetupOpen) {
      return (
        <GameSetupForm
          onStart={handleStartGame}
          onCancel={() => setIsSetupOpen(false)}
        />
      );
    }
    return (
      <div className="flex flex-col items-center gap-5 py-10 text-center">
        <div className="text-5xl">🔍</div>
        <div>
          <div className="text-xl font-bold text-slate-100">Guess It!</div>
          <div className="text-sm text-slate-500 mt-1 max-w-xs leading-relaxed">
            Define rounds upfront — each round has one clue image and one
            secret answer. Players guess in turns; reveal hints letter by letter.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsSetupOpen(true)}
          className="px-8 py-3 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-500 transition-colors"
        >
          Start a game
        </button>
      </div>
    );
  }

  // Game finished
  if (gameState.status === "finished") {
    return <FinalScoreboard gameState={gameState} onReset={resetGame} />;
  }

  const round = gameState.currentRound;
  if (!round) return null;

  // Round finished — show results
  if (round.status === "finished") {
    return (
      <RoundResults
        gameState={gameState}
        round={round}
        amQuestioner={amQuestioner}
        onNextRound={nextRound}
      />
    );
  }

  // Active round
  return (
    <ActiveRound
      gameState={gameState}
      round={round}
      mySocketId={mySocketId}
      isMyTurn={isMyTurn}
      amQuestioner={amQuestioner}
      guessInput={guessInput}
      setGuessInput={setGuessInput}
      onSubmitGuess={handleSubmitGuess}
      onRevealHint={revealHint}
      onSkipTurn={skipTurn}
      onEndRound={endRound}
      onEndGame={() => {}} // exposed via questioner controls via endRound on last round
    />
  );
}
