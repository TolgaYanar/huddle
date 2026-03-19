"use client";

import React, { useCallback, useState } from "react";
import type {
  GameData,
  GameQuestioner,
  GameRound,
  GameRoundInput,
  GameStateData,
} from "shared-logic";

const CATEGORIES = [
  "Brands", "People", "Places", "Movies & TV",
  "Music", "Sports", "Animals", "Things", "Other",
];

// ─── Types ────────────────────────────────────────────────────────────────────

export type GamePanelProps = {
  gameState: GameStateData;
  mySocketId: string;
  isRoomHost: boolean;
  createGame: (rounds: GameRoundInput[]) => void;
  addRounds: (gameId: string, rounds: GameRoundInput[]) => void;
  removeRounds: (gameId: string) => void;
  startSession: (gameId: string) => void;
  submitGuess: (gameId: string, guess: string) => void;
  revealHint: (gameId: string) => void;
  skipTurn: (gameId: string) => void;
  endRound: (gameId: string) => void;
  nextRound: (gameId: string) => void;
  endSession: (gameId: string) => void;
  resetGame: (gameId: string) => void;
};

// ─── Image result cell ────────────────────────────────────────────────────────

interface ImageResult {
  url: string;
  thumbnail: string;
  title: string;
}

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
        selected
          ? "border-sky-400"
          : "border-transparent hover:border-sky-400/50"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img.thumbnail}
        alt={img.title}
        className="max-w-full max-h-full w-auto h-auto object-contain p-2"
        onError={() => setHidden(true)}
      />
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

// ─── Image picker ─────────────────────────────────────────────────────────────

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
      if (data.error)
        setError("Search failed — try a different query or paste a URL");
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
      <div className="flex gap-1 bg-black/30 p-1 rounded-xl">
        {(["search", "url"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setError("");
            }}
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
            <div className="text-xs text-emerald-400 font-medium">
              Image selected ✓
            </div>
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

// ─── Round editor (single active round) ──────────────────────────────────────

function RoundEditor({
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
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/3 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Round {index + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-slate-600 hover:text-rose-400 transition-colors text-sm px-1"
          >
            Remove
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-slate-500">Category</label>
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
          <label className="text-xs text-slate-500">
            Answer <span className="text-slate-600">(hidden from guessers)</span>
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

      <label className="flex items-center gap-2.5 cursor-pointer">
        <div className="relative shrink-0">
          <input
            type="checkbox"
            checked={round.hideBlanks}
            onChange={(e) => onChange({ ...round, hideBlanks: e.target.checked })}
            className="sr-only"
          />
          <div className={`w-8 h-4 rounded-full border transition-colors ${round.hideBlanks ? "bg-sky-600 border-sky-500" : "bg-white/10 border-white/20"}`}>
            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${round.hideBlanks ? "translate-x-4" : "translate-x-0.5"}`} />
          </div>
        </div>
        <span className="text-xs text-slate-400">Hide letter count until first hint</span>
      </label>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-slate-500">Clue image</label>
        <ImagePicker
          selected={round.image}
          onSelect={(url) => onChange({ ...round, image: url })}
        />
      </div>
    </div>
  );
}

// ─── Round setup form (create or add) ────────────────────────────────────────

function RoundSetupForm({
  title,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  title: string;
  submitLabel: string;
  onSubmit: (rounds: GameRoundInput[]) => void;
  onCancel: () => void;
}) {
  const [rounds, setRounds] = useState<GameRoundInput[]>([
    { category: "Brands", answer: "", image: "", hideBlanks: false },
  ]);
  const [activeIdx, setActiveIdx] = useState(0);

  const addRound = () => {
    if (rounds.length >= 10) return;
    const newIdx = rounds.length;
    setRounds((prev) => [
      ...prev,
      { category: "Brands", answer: "", image: "", hideBlanks: false },
    ]);
    setActiveIdx(newIdx);
  };

  const removeRound = (i: number) => {
    setRounds((prev) => prev.filter((_, idx) => idx !== i));
    setActiveIdx((prev) => Math.min(prev, rounds.length - 2));
  };

  const updateRound = (i: number, r: GameRoundInput) =>
    setRounds((prev) => prev.map((x, idx) => (idx === i ? r : x)));

  const isRoundValid = (r: GameRoundInput) =>
    r.answer.trim().length > 0 && r.image.length > 0;

  const validRounds = rounds.filter(isRoundValid);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-base font-semibold text-slate-100">{title}</div>
        <div className="text-xs text-slate-500">
          {validRounds.length}/{rounds.length} ready
        </div>
      </div>

      {/* Round chips */}
      <div className="flex items-center gap-2 flex-wrap">
        {rounds.map((r, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActiveIdx(i)}
            title={r.answer.trim() || `Round ${i + 1}`}
            className={`w-9 h-9 rounded-full text-xs font-bold transition-all ${
              i === activeIdx
                ? isRoundValid(r)
                  ? "bg-sky-500 text-white ring-2 ring-sky-400/40 ring-offset-1 ring-offset-[#1a1a2e]"
                  : "bg-white/15 text-white ring-2 ring-white/25 ring-offset-1 ring-offset-[#1a1a2e]"
                : isRoundValid(r)
                  ? "bg-sky-600/30 text-sky-300 hover:bg-sky-600/50"
                  : "bg-white/8 text-slate-500 hover:bg-white/12 hover:text-slate-300"
            }`}
          >
            {isRoundValid(r) ? "✓" : i + 1}
          </button>
        ))}
        {rounds.length < 10 && (
          <button
            type="button"
            onClick={addRound}
            title="Add round"
            className="w-9 h-9 rounded-full border border-dashed border-white/20 text-slate-500 text-lg hover:border-sky-500/50 hover:text-sky-400 transition-colors"
          >
            +
          </button>
        )}
      </div>

      {/* Active round editor — key resets ImagePicker state when switching */}
      <RoundEditor
        key={activeIdx}
        index={activeIdx}
        round={rounds[activeIdx]!}
        onChange={(r) => updateRound(activeIdx, r)}
        onRemove={() => removeRound(activeIdx)}
        canRemove={rounds.length > 1}
      />

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl border border-white/10 bg-white/5 text-slate-300 text-sm hover:bg-white/10 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={validRounds.length === 0}
          onClick={() => onSubmit(validRounds)}
          className="flex-1 py-2.5 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitLabel} ({validRounds.length})
        </button>
      </div>
    </div>
  );
}

// ─── Answer blanks ────────────────────────────────────────────────────────────

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

// ─── Active round view ────────────────────────────────────────────────────────

function ActiveRoundView({
  game,
  questioner,
  round,
  mySocketId,
  onGuess,
  onRevealHint,
  onSkipTurn,
  onEndRound,
}: {
  game: GameData;
  questioner: GameQuestioner;
  round: GameRound;
  mySocketId: string;
  onGuess: (guess: string) => void;
  onRevealHint: () => void;
  onSkipTurn: () => void;
  onEndRound: () => void;
}) {
  const [guessInput, setGuessInput] = useState("");
  const isMyTurn =
    game.session.currentGuesserSocketId === mySocketId &&
    round.status === "active";
  const amActiveQuestioner = questioner.socketId === mySocketId;
  const amCreator = game.creatorId === mySocketId;
  const iAmWinner = round.winners.includes(mySocketId);
  const blanksHidden =
    round.hideBlanks && round.hintsRevealed === 0 && !amActiveQuestioner;

  const currentGuesserName =
    game.session.currentGuesserSocketId
      ? game.session.participantUsernames[
          game.session.currentGuesserSocketId
        ] ?? "Someone"
      : "Someone";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guessInput.trim()) return;
    onGuess(guessInput.trim());
    setGuessInput("");
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-400">
            Round {questioner.currentRoundIndex + 1} of {questioner.totalRounds}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-lg bg-sky-600/20 text-sky-300 border border-sky-600/30">
            {round.category}
          </span>
        </div>
        <span className="text-xs text-slate-500">
          by {questioner.username ?? "Unknown"}
        </span>
      </div>

      {/* Clue image */}
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

      {/* Answer blanks */}
      <AnswerBlanks masked={round.answerMasked} hidden={blanksHidden} />

      {amActiveQuestioner && round.hideBlanks && round.hintsRevealed === 0 && (
        <p className="text-center text-xs text-amber-400/60">
          Players see "Answer hidden" until first hint
        </p>
      )}
      {round.hintsRevealed > 0 && (
        <p className="text-center text-xs text-amber-400">
          {round.hintsRevealed} hint{round.hintsRevealed === 1 ? "" : "s"}{" "}
          revealed
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
        {iAmWinner
          ? "You guessed it! Waiting for others…"
          : isMyTurn
            ? "Your turn to guess!"
            : amActiveQuestioner
              ? `Waiting for ${currentGuesserName} to guess…`
              : `${currentGuesserName}'s turn`}
      </div>

      {/* Guess input */}
      {!amActiveQuestioner && isMyTurn && !iAmWinner && (
        <form onSubmit={handleSubmit} className="flex gap-2">
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

      {/* Questioner / creator controls */}
      {(amActiveQuestioner || amCreator) && (
        <div className="grid grid-cols-2 gap-2">
          {amActiveQuestioner && (
            <button
              type="button"
              onClick={onRevealHint}
              className="py-2.5 rounded-xl border border-amber-500/30 bg-amber-600/10 text-amber-300 text-sm font-medium hover:bg-amber-600/20 transition-colors"
            >
              Reveal a letter
            </button>
          )}
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
            className={`${amActiveQuestioner ? "col-span-2" : "col-span-full"} py-2.5 rounded-xl border border-rose-500/30 bg-rose-600/10 text-rose-300 text-sm font-medium hover:bg-rose-600/20 transition-colors`}
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
                <span
                  className={
                    g.correct ? "text-emerald-300 font-medium" : "text-slate-300"
                  }
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

// ─── Round results view ───────────────────────────────────────────────────────

function RoundResultsView({
  game,
  questioner,
  round,
  mySocketId,
  onNextRound,
}: {
  game: GameData;
  questioner: GameQuestioner;
  round: GameRound;
  mySocketId: string;
  onNextRound: () => void;
}) {
  const canAdvance =
    questioner.socketId === mySocketId || game.creatorId === mySocketId;
  // Rounds remaining after this one (for current questioner and all others)
  const remainingCurrent = questioner.totalRounds - questioner.currentRoundIndex - 1;
  const remainingOthers = game.questioners
    .filter((q) => q.socketId !== questioner.socketId)
    .reduce((sum, q) => sum + Math.max(0, q.totalRounds - q.currentRoundIndex), 0);
  const hasMore = remainingCurrent > 0 || remainingOthers > 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          Round {questioner.currentRoundIndex + 1} of {questioner.totalRounds}{" "}
          — {questioner.username ?? "Unknown"}
        </span>
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
        <div className="text-center text-sm text-slate-500">
          Nobody guessed it
        </div>
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
              <span
                className={
                  g.correct ? "text-emerald-300 font-medium" : "text-slate-300"
                }
              >
                {g.guess}
                {g.correct && " ✓"}
              </span>
            </div>
          ))}
        </div>
      )}

      {canAdvance && (
        <button
          type="button"
          onClick={onNextRound}
          className="w-full py-3 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-500 transition-colors"
        >
          {hasMore ? "Next round →" : "See final scores →"}
        </button>
      )}
      {!canAdvance && (
        <p className="text-center text-xs text-slate-500">
          Waiting for {questioner.username ?? "the questioner"} to continue…
        </p>
      )}
    </div>
  );
}

// ─── Final scoreboard ─────────────────────────────────────────────────────────

function FinalScoreboard({
  game,
  mySocketId,
  isRoomHost,
  onReset,
}: {
  game: GameData;
  mySocketId: string;
  isRoomHost: boolean;
  onReset: () => void;
}) {
  const isCreator = game.creatorId === mySocketId;
  const canManage = isCreator || isRoomHost;
  const totalRounds = game.questioners.reduce(
    (sum, q) => sum + q.totalRounds,
    0,
  );
  const scores = Object.entries(game.scoreboard).sort(
    ([, a], [, b]) => b.wins - a.wins,
  );

  return (
    <div className="flex flex-col gap-6 py-2">
      <div className="text-center">
        <div className="text-4xl mb-2">🏆</div>
        <div className="text-xl font-bold text-slate-100">Game over!</div>
        <div className="text-sm text-slate-500 mt-1">
          {totalRounds} round{totalRounds !== 1 ? "s" : ""} across{" "}
          {game.questioners.length} questioner
          {game.questioners.length !== 1 ? "s" : ""}
        </div>
      </div>

      {scores.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">
            Scoreboard
          </div>
          {scores.map(([socketId, entry], i) => (
            <div
              key={socketId}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                i === 0
                  ? "bg-amber-600/10 border-amber-500/30"
                  : "bg-white/5 border-white/5"
              }`}
            >
              <span className="text-lg">
                {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`}
              </span>
              <span className="flex-1 font-medium text-slate-200">
                {entry.username ?? "Unknown"}
              </span>
              <span
                className={`text-sm font-bold ${i === 0 ? "text-amber-300" : "text-slate-400"}`}
              >
                {entry.wins} / {totalRounds}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center text-slate-500">
          Nobody scored any points!
        </div>
      )}

      {canManage && (
        <button
          type="button"
          onClick={onReset}
          className="w-full py-3 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-500 transition-colors"
        >
          Delete game
        </button>
      )}
    </div>
  );
}

// ─── Staging view (game being set up) ────────────────────────────────────────

function StagingView({
  game,
  mySocketId,
  isRoomHost,
  onAddRounds,
  onRemoveRounds,
  onStart,
  onDelete,
}: {
  game: GameData;
  mySocketId: string;
  isRoomHost: boolean;
  onAddRounds: (rounds: GameRoundInput[]) => void;
  onRemoveRounds: () => void;
  onStart: () => void;
  onDelete: () => void;
}) {
  const [setupOpen, setSetupOpen] = useState(false);
  const isCreator = game.creatorId === mySocketId;
  const canManage = isCreator || isRoomHost;
  const amQuestioner = game.questioners.some((q) => q.socketId === mySocketId);

  if (setupOpen) {
    return (
      <RoundSetupForm
        title={amQuestioner ? "Update your rounds" : "Add your rounds"}
        submitLabel={amQuestioner ? "Update" : "Join as questioner"}
        onSubmit={(rounds) => {
          onAddRounds(rounds);
          setSetupOpen(false);
        }}
        onCancel={() => setSetupOpen(false)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div className="text-base font-semibold text-slate-100">
          Setting up game
        </div>
        <span className="text-xs px-2 py-1 rounded-lg bg-amber-600/20 text-amber-300 border border-amber-600/30">
          Staging
        </span>
      </div>

      <p className="text-sm text-slate-400">
        Players can join as questioners by adding their own rounds. The creator
        starts the session when everyone is ready.
      </p>

      {/* Questioners list */}
      <div className="flex flex-col gap-2">
        <div className="text-xs text-slate-500 font-medium">
          Questioners ({game.questioners.length})
        </div>
        {game.questioners.map((q) => (
          <div
            key={q.socketId}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10"
          >
            <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            <span className="flex-1 text-sm text-slate-200">
              {q.username ?? "Unknown"}
              {q.socketId === game.creatorId && (
                <span className="ml-2 text-xs text-slate-500">(creator)</span>
              )}
              {q.socketId === mySocketId && (
                <span className="ml-2 text-xs text-sky-400">(you)</span>
              )}
            </span>
            <span className="text-xs text-slate-500">
              {q.totalRounds} round{q.totalRounds !== 1 ? "s" : ""}
            </span>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setSetupOpen(true)}
          className="w-full py-2.5 rounded-xl border border-sky-600/40 bg-sky-600/10 text-sky-300 text-sm font-medium hover:bg-sky-600/20 transition-colors"
        >
          {amQuestioner ? "Edit my rounds" : "+ Add my rounds"}
        </button>

        {amQuestioner && !canManage && (
          <button
            type="button"
            onClick={onRemoveRounds}
            className="w-full py-2.5 rounded-xl border border-white/10 bg-white/5 text-slate-400 text-sm hover:bg-white/10 transition-colors"
          >
            Remove my rounds
          </button>
        )}

        {canManage && (
          <>
            <button
              type="button"
              onClick={onStart}
              disabled={game.questioners.length === 0}
              className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Start game ({game.questioners.length} questioner
              {game.questioners.length !== 1 ? "s" : ""})
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="w-full py-2.5 rounded-xl border border-white/10 bg-white/5 text-rose-400 text-sm hover:bg-white/10 transition-colors"
            >
              Delete game
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Single game view ─────────────────────────────────────────────────────────

function GameView({
  game,
  mySocketId,
  isRoomHost,
  onAddRounds,
  onRemoveRounds,
  onStart,
  onGuess,
  onRevealHint,
  onSkipTurn,
  onEndRound,
  onNextRound,
  onEndSession,
  onReset,
  onBack,
}: {
  game: GameData;
  mySocketId: string;
  isRoomHost: boolean;
  onAddRounds: (rounds: GameRoundInput[]) => void;
  onRemoveRounds: () => void;
  onStart: () => void;
  onGuess: (guess: string) => void;
  onRevealHint: () => void;
  onSkipTurn: () => void;
  onEndRound: () => void;
  onNextRound: () => void;
  onEndSession: () => void;
  onReset: () => void;
  onBack: () => void;
}) {
  const isCreator = game.creatorId === mySocketId;
  const canManage = isCreator || isRoomHost;

  const header = (
    <div className="flex items-center gap-3 mb-5">
      <button
        type="button"
        onClick={onBack}
        className="text-slate-500 hover:text-slate-300 transition-colors text-sm"
      >
        ← Back
      </button>
      <div className="flex-1 text-sm font-medium text-slate-300 truncate">
        {game.creatorName ?? "Unknown"}'s game
      </div>
      {canManage && game.status === "active" && (
        <button
          type="button"
          onClick={onEndSession}
          className="text-xs text-rose-400 hover:text-rose-300 transition-colors px-2 py-1 rounded-lg border border-rose-500/20 hover:border-rose-500/40"
        >
          End game
        </button>
      )}
    </div>
  );

  if (game.status === "staging") {
    return (
      <div>
        {header}
        <StagingView
          game={game}
          mySocketId={mySocketId}
          isRoomHost={isRoomHost}
          onAddRounds={onAddRounds}
          onRemoveRounds={onRemoveRounds}
          onStart={onStart}
          onDelete={onReset}
        />
      </div>
    );
  }

  if (game.status === "finished") {
    return (
      <div>
        {header}
        <FinalScoreboard game={game} mySocketId={mySocketId} isRoomHost={isRoomHost} onReset={onReset} />
      </div>
    );
  }

  // Active game — show questioner tabs
  return (
    <div>
      {header}

      {/* Questioner tabs */}
      {game.questioners.length > 1 && (
        <div className="flex gap-1 bg-black/30 p-1 rounded-xl mb-4 overflow-x-auto">
          {game.questioners.map((q) => (
            <div
              key={q.socketId}
              className={`flex-1 min-w-max px-3 py-1.5 rounded-lg text-xs font-medium text-center transition-colors ${
                q.isActive
                  ? "bg-sky-600 text-white"
                  : q.isDone
                    ? "text-slate-600 line-through"
                    : "text-slate-400"
              }`}
            >
              {q.username ?? "Unknown"}
              {q.isActive && <span className="ml-1 text-sky-200">●</span>}
            </div>
          ))}
        </div>
      )}

      {/* Active questioner's round */}
      {(() => {
        const questioner = game.questioners.find((q) => q.isActive);
        if (!questioner) return null;
        const round = questioner.currentRound;
        if (!round) return null;

        if (round.status === "finished") {
          return (
            <RoundResultsView
              game={game}
              questioner={questioner}
              round={round}
              mySocketId={mySocketId}
              onNextRound={onNextRound}
            />
          );
        }

        return (
          <ActiveRoundView
            game={game}
            questioner={questioner}
            round={round}
            mySocketId={mySocketId}
            onGuess={onGuess}
            onRevealHint={onRevealHint}
            onSkipTurn={onSkipTurn}
            onEndRound={onEndRound}
          />
        );
      })()}
    </div>
  );
}

// ─── Game lobby ───────────────────────────────────────────────────────────────

function GameLobby({
  games,
  mySocketId,
  isRoomHost,
  onSelectGame,
  onCreateGame,
  onDeleteGame,
}: {
  games: GameData[];
  mySocketId: string;
  isRoomHost: boolean;
  onSelectGame: (gameId: string) => void;
  onCreateGame: (rounds: GameRoundInput[]) => void;
  onDeleteGame: (gameId: string) => void;
}) {
  const [creatingGame, setCreatingGame] = useState(false);

  if (creatingGame) {
    return (
      <RoundSetupForm
        title="Create game — your rounds"
        submitLabel="Create game"
        onSubmit={(rounds) => {
          onCreateGame(rounds);
          setCreatingGame(false);
        }}
        onCancel={() => setCreatingGame(false)}
      />
    );
  }

  const statusBadge = (game: GameData) => {
    if (game.status === "staging")
      return (
        <span className="text-xs px-2 py-0.5 rounded-lg bg-amber-600/20 text-amber-300 border border-amber-600/30">
          Staging
        </span>
      );
    if (game.status === "active")
      return (
        <span className="text-xs px-2 py-0.5 rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-600/30">
          Active
        </span>
      );
    return (
      <span className="text-xs px-2 py-0.5 rounded-lg bg-white/10 text-slate-400">
        Finished
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div className="text-base font-semibold text-slate-100">Guess It!</div>
        <button
          type="button"
          onClick={() => setCreatingGame(true)}
          className="px-4 py-1.5 rounded-xl bg-sky-600 text-white text-xs font-semibold hover:bg-sky-500 transition-colors"
        >
          + New game
        </button>
      </div>

      {games.length === 0 ? (
        <div className="flex flex-col items-center gap-5 py-10 text-center">
          <div className="text-5xl">🔍</div>
          <div className="text-sm text-slate-500 max-w-xs leading-relaxed">
            Create a game — define your rounds, let others join as questioners
            with their own rounds, then start playing!
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {games.map((game) => {
            const totalRounds = game.questioners.reduce(
              (s, q) => s + q.totalRounds,
              0,
            );
            const canDelete = isRoomHost || game.creatorId === mySocketId;
            return (
              <div key={game.gameId} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSelectGame(game.gameId)}
                  className="flex-1 flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-left min-w-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-200 truncate">
                      {game.creatorName ?? "Unknown"}'s game
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {game.questioners.length} questioner
                      {game.questioners.length !== 1 ? "s" : ""} · {totalRounds}{" "}
                      round{totalRounds !== 1 ? "s" : ""}
                    </div>
                  </div>
                  {statusBadge(game)}
                </button>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => onDeleteGame(game.gameId)}
                    title="Delete game"
                    className="shrink-0 h-9 w-9 rounded-xl border border-white/10 bg-white/5 text-rose-400 hover:bg-rose-600/20 hover:border-rose-500/30 transition-colors flex items-center justify-center text-lg"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main GamePanel ───────────────────────────────────────────────────────────

export function GamePanel({
  gameState,
  mySocketId,
  isRoomHost,
  createGame,
  addRounds,
  removeRounds,
  startSession,
  submitGuess,
  revealHint,
  skipTurn,
  endRound,
  nextRound,
  endSession,
  resetGame,
}: GamePanelProps) {
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const prevGameIdsRef = React.useRef<Set<string>>(new Set());

  const selectedGame = gameState.games.find(
    (g) => g.gameId === selectedGameId,
  );

  // Auto-select newly created game (mine) or the only active game
  React.useEffect(() => {
    const currentIds = new Set(gameState.games.map((g) => g.gameId));
    const newGame = gameState.games.find(
      (g) =>
        !prevGameIdsRef.current.has(g.gameId) && g.creatorId === mySocketId,
    );
    if (newGame) {
      setSelectedGameId(newGame.gameId);
    } else if (!selectedGameId) {
      const active = gameState.games.find((g) => g.status === "active");
      if (active) setSelectedGameId(active.gameId);
    }
    prevGameIdsRef.current = currentIds;
  }, [gameState.games, mySocketId, selectedGameId]);

  if (selectedGame) {
    return (
      <GameView
        game={selectedGame}
        mySocketId={mySocketId}
        isRoomHost={isRoomHost}
        onAddRounds={(rounds) => addRounds(selectedGame.gameId, rounds)}
        onRemoveRounds={() => removeRounds(selectedGame.gameId)}
        onStart={() => startSession(selectedGame.gameId)}
        onGuess={(guess) => submitGuess(selectedGame.gameId, guess)}
        onRevealHint={() => revealHint(selectedGame.gameId)}
        onSkipTurn={() => skipTurn(selectedGame.gameId)}
        onEndRound={() => endRound(selectedGame.gameId)}
        onNextRound={() => nextRound(selectedGame.gameId)}
        onEndSession={() => endSession(selectedGame.gameId)}
        onReset={() => {
          resetGame(selectedGame.gameId);
          setSelectedGameId(null);
        }}
        onBack={() => setSelectedGameId(null)}
      />
    );
  }

  return (
    <GameLobby
      games={gameState.games}
      mySocketId={mySocketId}
      isRoomHost={isRoomHost}
      onSelectGame={setSelectedGameId}
      onCreateGame={(rounds) => {
        createGame(rounds);
      }}
      onDeleteGame={(gameId) => resetGame(gameId)}
    />
  );
}
