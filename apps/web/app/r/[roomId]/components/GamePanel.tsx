"use client";

import React, { useCallback, useEffect, useState } from "react";
import type {
  CreateGameOptions,
  GameData,
  GameQuestioner,
  GameRound,
  GameRoundInput,
  GameStateData,
} from "shared-logic";

import { ImageEditor } from "./imageEditor/ImageEditor";

const CATEGORIES = [
  "Brands", "People", "Places", "Movies & TV",
  "Music", "Sports", "Animals", "Things", "Other",
];

// Turn-timer choices surfaced in the setup form. null means "no timer".
const TURN_TIMER_OPTIONS: { label: string; value: number | null }[] = [
  { label: "Off", value: null },
  { label: "20s", value: 20 },
  { label: "30s", value: 30 },
  { label: "60s", value: 60 },
  { label: "90s", value: 90 },
];

// ─── Types ────────────────────────────────────────────────────────────────────

export type GamePanelProps = {
  gameState: GameStateData;
  mySocketId: string;
  isRoomHost: boolean;
  createGame: (rounds: GameRoundInput[], options?: CreateGameOptions) => void;
  addRounds: (gameId: string, rounds: GameRoundInput[]) => void;
  removeRounds: (gameId: string) => void;
  startSession: (gameId: string) => void;
  submitGuess: (gameId: string, guess: string) => void;
  revealHint: (gameId: string) => void;
  skipTurn: (gameId: string) => void;
  endRound: (gameId: string) => void;
  nextRound: (gameId: string) => void;
  endSession: (gameId: string) => void;
  setObserver: (gameId: string, observer: boolean) => void;
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
  type Tab = "search" | "ai" | "url";
  // Default to "search" — Wikipedia returns the canonical image for any
  // proper noun (brand, place, person) and that's what most clues
  // actually need. AI is the better tool only for creative prompts.
  const [tab, setTab] = useState<Tab>("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ImageResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [error, setError] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

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
        errors?: string[];
      };
      const hits = data.images ?? [];
      setResults(hits);

      if (hits.length === 0 && data.errors && data.errors.length > 0) {
        // Surface the upstream failure reason so we know what to fix.
        setError(`Search failed: ${data.errors.join("; ")}`);
      } else if (data.error && hits.length === 0) {
        setError("Search failed — try a different query or paste a URL");
      } else if (hits.length === 0) {
        setError("No images found — try a different name or use ✨ AI");
      }
    } catch {
      setError("Search failed — try a different query or paste a URL");
    } finally {
      setLoading(false);
    }
  }, [query]);

  const generate = useCallback(async () => {
    const prompt = aiPrompt.trim();
    if (!prompt) return;
    setAiLoading(true);
    setError("");
    setAiResult(null);
    try {
      // Fresh seed each click so identical prompts still produce a new
      // image — players who don't like the first try can re-roll.
      const seed = Math.floor(Math.random() * 1_000_000_000);
      const res = await fetch(
        `/api/image-generate?prompt=${encodeURIComponent(prompt)}&seed=${seed}`,
      );
      // Best-effort JSON parse — Vercel can serve a non-JSON body when its
      // own gateway gives up before our function returns.
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        dataUrl?: string;
        reason?: string;
        hint?: string;
      } | null;

      if (!data) {
        setError(
          res.status >= 500
            ? `The image generator timed out (HTTP ${res.status}). Try again — it's often quick on the second try.`
            : `Image generator returned an unexpected response (HTTP ${res.status}).`,
        );
        return;
      }

      if (!data.ok || !data.dataUrl) {
        // Prefer the server's friendly hint, but always include the reason
        // code so error feedback is debuggable if something new breaks.
        const reasonTag = data.reason ? ` (${data.reason})` : "";
        setError((data.hint || "Couldn't generate that image.") + reasonTag);
        return;
      }
      setAiResult(data.dataUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      setError(`Couldn't reach the image generator (${msg}).`);
    } finally {
      setAiLoading(false);
    }
  }, [aiPrompt]);

  const applyUrl = () => {
    const url = urlInput.trim();
    if (!url.startsWith("http")) {
      setError("Please enter a valid URL starting with http");
      return;
    }
    onSelect(url);
    setError("");
  };

  const tabLabel: Record<Tab, string> = {
    search: "🔍 Search",
    ai: "✨ AI",
    url: "Paste URL",
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1 bg-black/30 p-1 rounded-xl">
        {(["search", "ai", "url"] as const).map((t) => (
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
            {tabLabel[t]}
          </button>
        ))}
      </div>

      {tab === "ai" && (
        <>
          <div className="flex gap-2">
            <input
              type="text"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && generate()}
              placeholder="Describe the image — e.g. red dragon eating ice cream"
              maxLength={240}
              className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/25"
            />
            <button
              type="button"
              onClick={generate}
              disabled={aiLoading || !aiPrompt.trim()}
              className="px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-medium hover:bg-sky-500 transition-colors disabled:opacity-50"
            >
              {aiLoading ? "…" : "Generate"}
            </button>
          </div>
          {error && <p className="text-xs text-rose-400">{error}</p>}
          {aiLoading && (
            <div
              className="flex flex-col items-center justify-center gap-2 w-full h-48 rounded-xl border border-white/10 bg-black/30"
              aria-live="polite"
            >
              <svg
                className="w-7 h-7 animate-spin text-sky-400"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
                />
              </svg>
              <span className="text-sm text-slate-300 font-medium">
                Painting your image…
              </span>
              <span className="text-xs text-slate-500">
                Can take 10–30 seconds.
              </span>
            </div>
          )}
          {aiResult && !aiLoading && (
            <div className="flex flex-col gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={aiResult}
                alt="Generated"
                className="w-full max-h-64 object-contain rounded-xl border border-white/10 bg-black/30"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={generate}
                  disabled={aiLoading}
                  className="flex-1 px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-slate-200 text-sm hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                  Re-roll
                </button>
                <button
                  type="button"
                  onClick={() => onSelect(aiResult)}
                  className="flex-1 px-3 py-2 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-500 transition-colors"
                >
                  Use this image
                </button>
              </div>
            </div>
          )}
          {!aiResult && !aiLoading && !error && (
            <p className="text-xs text-slate-600 leading-relaxed">
              Describe an imaginary scene — &ldquo;red dragon eating ice
              cream&rdquo;. For real-world things (brands, places, people),
              use the 🔍 Search tab — AI doesn&apos;t reliably draw real
              logos or famous people.
            </p>
          )}
        </>
      )}

      {tab === "search" && (
        <>
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder="Brand, place, or person — e.g. Hyundai, Eiffel Tower"
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
            <p className="text-xs text-slate-600 text-center py-4 leading-relaxed">
              Type a brand, place, or person — we&apos;ll find the canonical
              picture from Wikipedia. For made-up things use the ✨ AI tab.
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
            Right-click any image on the web → &ldquo;Copy image address&rdquo;
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
              {selected.startsWith("data:")
                ? "Edited image ✓"
                : "Image selected ✓"}
            </div>
            <div className="text-xs text-slate-500 truncate">
              {selected.startsWith("data:") ? "Local edit" : selected}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setEditorOpen(true)}
            aria-label="Edit image"
            className="text-xs text-sky-400 hover:text-sky-300 px-2 py-1 rounded-lg border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 transition-colors"
          >
            ✎ Edit
          </button>
          <button
            type="button"
            onClick={() => onSelect("")}
            aria-label="Remove image"
            className="text-slate-500 hover:text-slate-300 text-lg px-1"
          >
            ×
          </button>
        </div>
      )}

      <ImageEditor
        src={editorOpen ? selected : null}
        onClose={() => setEditorOpen(false)}
        onSave={(dataUrl) => {
          onSelect(dataUrl);
          setEditorOpen(false);
        }}
      />
    </div>
  );
}

// ─── Round editor (single active round) ──────────────────────────────────────

function RoundEditor({
  round,
  onChange,
  onRemove,
  canRemove,
}: {
  round: GameRoundInput;
  onChange: (round: GameRoundInput) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(!round.image);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/3 p-4">
      {/* Category + Answer */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
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
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">Answer <span className="text-slate-600">(secret)</span></label>
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

      {/* Image section — collapsed when an image is set */}
      {pickerOpen ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-slate-500">Clue image <span className="text-slate-600">(optional)</span></label>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              {round.image ? "Done ✓" : "Skip — text only"}
            </button>
          </div>
          <ImagePicker
            selected={round.image}
            onSelect={(url) => {
              onChange({ ...round, image: url });
              if (url) setPickerOpen(false);
            }}
          />
        </div>
      ) : round.image ? (
        <div className="flex items-center gap-3 p-2 rounded-xl bg-emerald-600/10 border border-emerald-600/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={round.image}
            alt="Clue"
            className="w-10 h-10 rounded-lg object-cover border border-white/10 shrink-0"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='%23334155'/%3E%3C/svg%3E";
            }}
          />
          <span className="flex-1 text-xs text-emerald-400 font-medium">Image selected ✓</span>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Change
          </button>
          <button
            type="button"
            onClick={() => { onChange({ ...round, image: "" }); }}
            className="text-slate-500 hover:text-rose-400 transition-colors text-lg leading-none px-1"
          >
            ×
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-2 text-xs text-slate-600 hover:text-sky-400 transition-colors py-0.5"
        >
          <span className="w-5 h-5 rounded-md border border-dashed border-white/15 flex items-center justify-center hover:border-sky-500/40 text-slate-600">+</span>
          Add clue image <span className="text-slate-700">(optional — text-only is fine)</span>
        </button>
      )}

      {/* Hide blanks toggle + remove */}
      <div className="flex items-center gap-2.5">
        <label className="flex items-center gap-2 cursor-pointer flex-1">
          <div className="relative shrink-0">
            <input
              type="checkbox"
              checked={round.hideBlanks}
              onChange={(e) => onChange({ ...round, hideBlanks: e.target.checked })}
              className="sr-only"
            />
            <div className={`w-7 h-3.5 rounded-full transition-colors ${round.hideBlanks ? "bg-sky-600" : "bg-white/10"}`}>
              <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-transform ${round.hideBlanks ? "translate-x-3.5" : "translate-x-0.5"}`} />
            </div>
          </div>
          <span className="text-xs text-slate-500">Hide letter count until first hint</span>
        </label>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-slate-600 hover:text-rose-400 transition-colors shrink-0"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Round setup form (create or add) ────────────────────────────────────────

function RoundSetupForm({
  title,
  submitLabel,
  showCreatorOptions,
  onSubmit,
  onCancel,
}: {
  title: string;
  submitLabel: string;
  /** When true, render game-level creator options (turn timer). */
  showCreatorOptions?: boolean;
  onSubmit: (rounds: GameRoundInput[], options?: CreateGameOptions) => void;
  onCancel: () => void;
}) {
  const [rounds, setRounds] = useState<GameRoundInput[]>([
    { category: "Brands", answer: "", image: "", hideBlanks: false },
  ]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [turnTimerSeconds, setTurnTimerSeconds] = useState<number | null>(null);

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
    r.answer.trim().length > 0;

  const validRounds = rounds.filter(isRoundValid);

  return (
    // 2-column on lg+: round chips + game settings + actions on the left,
    // the heavy round editor (with ImagePicker) on the right where it has
    // room to breathe. Single column on smaller screens.
    <div className="flex flex-col gap-4">
      {/* Header always full-width */}
      <div className="flex items-center justify-between">
        <div className="text-base font-semibold text-slate-100">{title}</div>
        <div className="text-xs text-slate-500">
          {validRounds.length}/{rounds.length} ready
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-4 lg:gap-5">
        {/* LEFT — round selector + game settings + actions */}
        <div className="flex flex-col gap-3 lg:sticky lg:top-0 lg:self-start">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
              Rounds ({rounds.length}/10)
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {rounds.map((r, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveIdx(i)}
                  title={r.answer.trim() || `Round ${i + 1}`}
                  className={`w-10 h-10 rounded-full text-sm font-bold transition-all ${
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
                  aria-label="Add round"
                  className="w-10 h-10 rounded-full border border-dashed border-white/20 text-slate-500 text-lg hover:border-sky-500/50 hover:text-sky-400 transition-colors"
                >
                  +
                </button>
              )}
            </div>
          </div>

          {showCreatorOptions && (
            <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/3 p-4">
              <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Game settings
              </div>
              <div className="flex items-center gap-3">
                <label
                  htmlFor="game-turn-timer"
                  className="text-xs text-slate-400 shrink-0"
                >
                  Turn timer
                </label>
                <select
                  id="game-turn-timer"
                  value={turnTimerSeconds ?? ""}
                  onChange={(e) =>
                    setTurnTimerSeconds(
                      e.target.value === "" ? null : Number(e.target.value),
                    )
                  }
                  className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/25"
                >
                  {TURN_TIMER_OPTIONS.map((o) => (
                    <option key={o.label} value={o.value ?? ""}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                When the timer expires the current guesser auto-skips. Hints
                cost points — full score for guessing without hints, less for
                each letter revealed.
              </p>
            </div>
          )}

          <div className="flex gap-2">
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
              onClick={() =>
                onSubmit(
                  validRounds,
                  showCreatorOptions ? { turnTimerSeconds } : undefined,
                )
              }
              className="flex-1 py-2.5 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitLabel} ({validRounds.length})
            </button>
          </div>
        </div>

        {/* RIGHT — active round editor (key resets ImagePicker state when
            switching between rounds). */}
        <div className="min-w-0">
          <RoundEditor
            key={activeIdx}
            round={rounds[activeIdx]!}
            onChange={(r) => updateRound(activeIdx, r)}
            onRemove={() => removeRound(activeIdx)}
            canRemove={rounds.length > 1}
          />
        </div>
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

// ─── Turn queue strip ─────────────────────────────────────────────────────────
//
// Visualises the guessing rotation: who's up now, who's waiting, who already
// got it, plus observers. The order reflects how the server picks the next
// guesser — it's the participant list filtered by observers, with the active
// questioner skipped.

function TurnQueue({
  game,
  round,
  mySocketId,
}: {
  game: GameData;
  round: GameRound;
  mySocketId: string;
}) {
  const activeQuestionerId = game.session.currentQuestionerId;
  const observers = new Set(game.session.observers ?? []);
  const winners = new Set(round.winners);
  const currentGuesserId = game.session.currentGuesserSocketId;

  // Keep participant order; split into guessers vs observers.
  const guessers = (game.session.participants ?? []).filter(
    (id) => id !== activeQuestionerId && !observers.has(id),
  );
  const observerList = (game.session.participants ?? []).filter((id) =>
    observers.has(id),
  );

  if (guessers.length === 0 && observerList.length === 0) return null;

  const renderPill = (id: string, kind: "guesser" | "observer") => {
    const name = game.session.participantUsernames[id] ?? id.slice(0, 6);
    const isMe = id === mySocketId;
    const won = winners.has(id);
    const isCurrent = id === currentGuesserId && !won;

    let cls =
      "px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap shrink-0 transition-colors ";
    let icon = "";
    if (kind === "observer") {
      cls += "border-white/10 bg-white/5 text-slate-500 italic";
      icon = "👁 ";
    } else if (isCurrent) {
      cls +=
        "border-sky-400/60 bg-sky-500/25 text-sky-100 ring-2 ring-sky-400/30";
      icon = "🎯 ";
    } else if (won) {
      cls += "border-emerald-500/40 bg-emerald-500/15 text-emerald-300";
      icon = "✓ ";
    } else {
      cls += "border-white/10 bg-white/5 text-slate-300";
    }

    return (
      <span key={id} className={cls} title={isMe ? "You" : name}>
        {icon}
        {isMe ? "You" : name}
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
        Turn order
      </div>
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mb-1">
        {guessers.map((id) => renderPill(id, "guesser"))}
        {observerList.length > 0 && (
          <>
            {guessers.length > 0 && (
              <span className="shrink-0 text-slate-600 px-1">·</span>
            )}
            {observerList.map((id) => renderPill(id, "observer"))}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Turn countdown ───────────────────────────────────────────────────────────
//
// Reads the absolute server-time deadline from the game payload, accounts
// for clock skew via serverNow, and renders a ticking seconds-left badge
// next to the turn banner. Renders nothing when the game has no timer or no
// active turn.

function useSecondsLeft(turnDeadline: number | null, serverNow: number) {
  const offset = serverNow ? Date.now() - serverNow : 0;
  const compute = () => {
    if (!turnDeadline) return null;
    return Math.max(0, Math.ceil((turnDeadline - (Date.now() - offset)) / 1000));
  };
  const [value, setValue] = useState<number | null>(compute);
  useEffect(() => {
    if (!turnDeadline) {
      setValue(null);
      return;
    }
    setValue(compute());
    const id = window.setInterval(() => setValue(compute()), 250);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnDeadline, serverNow]);
  return value;
}

function TurnCountdown({
  turnDeadline,
  serverNow,
  isMyTurn,
}: {
  turnDeadline: number | null;
  serverNow: number;
  isMyTurn: boolean;
}) {
  const seconds = useSecondsLeft(turnDeadline, serverNow);
  if (seconds === null) return null;

  const danger = seconds <= 5;
  const warning = !danger && seconds <= 10;
  const cls = danger
    ? "border-rose-500/40 bg-rose-500/15 text-rose-200"
    : warning
      ? "border-amber-500/40 bg-amber-500/15 text-amber-200"
      : "border-white/10 bg-white/5 text-slate-300";

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono font-semibold border tabular-nums ${cls} ${
        danger ? "animate-pulse" : ""
      }`}
      aria-label={`${seconds} seconds left${isMyTurn ? " — your turn" : ""}`}
    >
      ⏱ {seconds}s
    </span>
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
    // 2-column on lg+: clue/input on the left, guesses always visible on
    // the right so newly-submitted guesses don't push out of view.
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-4 lg:gap-5">
      {/* LEFT COLUMN */}
      <div className="flex flex-col gap-4 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400">
              Round {questioner.currentRoundIndex + 1} of{" "}
              {questioner.totalRounds}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-lg bg-sky-600/20 text-sky-300 border border-sky-600/30">
              {round.category}
            </span>
          </div>
          <span className="text-xs text-slate-500">
            by {questioner.username ?? "Unknown"}
          </span>
        </div>

        {/* Clue image — capped tighter on lg so the rest fits without scroll */}
        {round.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={round.image}
            alt="Clue"
            className="w-full max-h-64 lg:max-h-80 object-contain rounded-2xl border border-white/10 bg-black/20"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-24 rounded-2xl border border-dashed border-white/10 bg-white/3">
            <span className="text-sm text-slate-600">
              Text-only round — no image clue
            </span>
          </div>
        )}

        {/* Answer blanks */}
        <AnswerBlanks masked={round.answerMasked} hidden={blanksHidden} />

        {/* Turn queue */}
        <TurnQueue game={game} round={round} mySocketId={mySocketId} />

        {amActiveQuestioner &&
          round.hideBlanks &&
          round.hintsRevealed === 0 && (
            <p className="text-center text-xs text-amber-400/60">
              Players see &ldquo;Answer hidden&rdquo; until first hint
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
          className={`flex items-center justify-center gap-2 font-semibold py-3 px-3 rounded-xl border transition-colors ${
            isMyTurn
              ? "bg-sky-500/20 text-sky-200 border-sky-500/50 text-base ring-2 ring-sky-500/30 shadow-lg shadow-sky-500/10"
              : iAmWinner
                ? "bg-emerald-600/20 text-emerald-300 border-emerald-600/30 text-sm"
                : "bg-white/5 text-slate-400 border-white/5 text-sm"
          }`}
          aria-live="polite"
        >
          <span className="text-center">
            {iAmWinner
              ? "✓ You guessed it! Waiting for others…"
              : isMyTurn
                ? "🎯 Your turn — type your guess"
                : amActiveQuestioner
                  ? `Waiting for ${currentGuesserName} to guess…`
                  : `${currentGuesserName}'s turn`}
          </span>
          <TurnCountdown
            turnDeadline={game.session?.turnDeadline ?? null}
            serverNow={game.session?.serverNow ?? Date.now()}
            isMyTurn={isMyTurn}
          />
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
            {amActiveQuestioner &&
              (() => {
                const lettersRemaining = (round.answerMasked ?? []).filter(
                  (c) => c === "_",
                ).length;
                return (
                  <button
                    type="button"
                    onClick={onRevealHint}
                    disabled={lettersRemaining === 0}
                    className="py-2.5 rounded-xl border border-amber-500/30 bg-amber-600/10 text-amber-300 text-sm font-medium hover:bg-amber-600/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Reveal a letter
                    {lettersRemaining > 0 && (
                      <span className="ml-1 text-xs text-amber-400/70">
                        ({lettersRemaining} left)
                      </span>
                    )}
                  </button>
                );
              })()}
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
      </div>

      {/* RIGHT COLUMN — guesses panel, always visible on lg+ */}
      <GuessesPanel
        guesses={round.guesses}
        emptyHint={
          isMyTurn
            ? "Submit your guess — it'll show up here right away."
            : "No guesses yet."
        }
      />
    </div>
  );
}

// ─── Guesses panel ────────────────────────────────────────────────────────────
//
// Reused by ActiveRoundView (right column) and RoundResultsView (post-round
// recap). Newest guess on top so the just-submitted one is always visible.

function GuessesPanel({
  guesses,
  emptyHint,
}: {
  guesses: GameRound["guesses"];
  emptyHint?: string;
}) {
  return (
    <aside className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-black/20 p-3 lg:sticky lg:top-0 lg:self-start lg:max-h-[calc(92vh-7rem)] min-h-0">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">
          Guesses
        </div>
        <div className="text-[10px] text-slate-600 tabular-nums">
          {guesses.length}
        </div>
      </div>
      {guesses.length === 0 ? (
        <p className="text-xs text-slate-600 leading-relaxed py-2">
          {emptyHint ?? "No guesses yet."}
        </p>
      ) : (
        <div className="flex flex-col gap-1 overflow-y-auto pr-1 -mr-1 min-h-0">
          {[...guesses].reverse().map((g, i) => (
            <div
              key={i}
              className={`flex items-center justify-between gap-2 text-sm px-3 py-1.5 rounded-xl ${
                g.correct
                  ? "bg-emerald-600/15 border border-emerald-600/20"
                  : g.nearMiss
                    ? "bg-amber-600/10 border border-amber-600/25"
                    : "bg-white/5 border border-white/5"
              }`}
            >
              <span className="text-slate-400 truncate min-w-0">
                {g.username ?? "Unknown"}
              </span>
              <span
                className={`text-right truncate ${
                  g.correct
                    ? "text-emerald-300 font-medium"
                    : g.nearMiss
                      ? "text-amber-300"
                      : "text-slate-300"
                }`}
              >
                {g.guess}
                {g.correct && " ✓"}
                {!g.correct && g.nearMiss && (
                  <span className="ml-1.5 text-[10px] uppercase tracking-wider text-amber-400">
                    so close
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </aside>
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
    // Same 2-column pattern as ActiveRoundView so the post-round recap
    // doesn't suddenly reflow. Image + answer + winners on the left, the
    // full round-history of guesses on the right (using the shared
    // GuessesPanel — winners and near-misses keep their colour coding).
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-4 lg:gap-5">
      <div className="flex flex-col gap-5 min-w-0">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            Round {questioner.currentRoundIndex + 1} of{" "}
            {questioner.totalRounds} — {questioner.username ?? "Unknown"}
          </span>
          <span className="px-2 py-0.5 rounded-lg bg-white/5">
            {round.category}
          </span>
        </div>

        {round.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={round.image}
            alt="Clue"
            className="w-full max-h-52 lg:max-h-72 object-contain rounded-2xl border border-white/10 bg-black/20"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        )}

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
                title={
                  typeof w.points === "number"
                    ? `${w.points} pts`
                    : undefined
                }
              >
                {w.username ?? "Unknown"} ✓
                {typeof w.points === "number" && w.points !== 1 && (
                  <span className="ml-1.5 text-xs text-emerald-400/70">
                    +{Number(w.points.toFixed(2))}
                  </span>
                )}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-center text-sm text-slate-500">
            Nobody guessed it
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

      <GuessesPanel guesses={round.guesses} emptyHint="Nobody guessed." />
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
  const scores = Object.entries(game.scoreboard).sort(([, a], [, b]) => {
    const sa = typeof a.score === "number" ? a.score : a.wins;
    const sb = typeof b.score === "number" ? b.score : b.wins;
    if (sb !== sa) return sb - sa;
    return b.wins - a.wins;
  });

  const fmtScore = (n: number) => {
    if (Number.isInteger(n)) return String(n);
    // Trim trailing zeros, max 2 decimals.
    return Number(n.toFixed(2)).toString();
  };

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
          {scores.map(([socketId, entry], i) => {
            const pts =
              typeof entry.score === "number" ? entry.score : entry.wins;
            return (
              <div
                key={socketId}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                  i === 0
                    ? "bg-amber-600/10 border-amber-500/30"
                    : "bg-white/5 border-white/5"
                }`}
              >
                <span className="text-lg">
                  {i === 0
                    ? "🥇"
                    : i === 1
                      ? "🥈"
                      : i === 2
                        ? "🥉"
                        : `${i + 1}.`}
                </span>
                <span className="flex-1 font-medium text-slate-200">
                  {entry.username ?? "Unknown"}
                </span>
                <span
                  className={`text-sm font-bold tabular-nums ${
                    i === 0 ? "text-amber-300" : "text-slate-400"
                  }`}
                >
                  {fmtScore(pts)} pts
                </span>
                <span className="text-xs text-slate-500 tabular-nums shrink-0">
                  {entry.wins}/{totalRounds}
                </span>
              </div>
            );
          })}
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
  onSetObserver,
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
  onSetObserver: (observer: boolean) => void;
  onReset: () => void;
  onBack: () => void;
}) {
  const isCreator = game.creatorId === mySocketId;
  const canManage = isCreator || isRoomHost;
  const observers = new Set(game.session?.observers ?? []);
  const iAmObserver = observers.has(mySocketId);
  const iAmActiveQuestioner =
    game.session?.currentQuestionerId === mySocketId &&
    game.status === "active";

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
        {game.creatorName ?? "Unknown"}&rsquo;s game
      </div>
      {/* Watch-only toggle: hidden during finished sessions and for the
          currently-active questioner (can't observe while it's your round). */}
      {game.status !== "finished" && !iAmActiveQuestioner && (
        <button
          type="button"
          onClick={() => onSetObserver(!iAmObserver)}
          aria-pressed={iAmObserver ? "true" : "false"}
          title={
            iAmObserver
              ? "Re-join the guessing rotation"
              : "Stop being a guesser — keep watching"
          }
          className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
            iAmObserver
              ? "border-amber-500/30 bg-amber-600/15 text-amber-200 hover:bg-amber-600/25"
              : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
          }`}
        >
          {iAmObserver ? "👁 Watch only" : "🎮 Playing"}
        </button>
      )}
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
          {game.questioners.map((q) => {
            const progressLabel = `${Math.min(q.currentRoundIndex + (q.isDone ? 0 : 1), q.totalRounds)}/${q.totalRounds}`;
            return (
              <div
                key={q.socketId}
                className={`flex-1 min-w-max px-3 py-1.5 rounded-lg text-xs font-medium text-center transition-colors flex items-center justify-center gap-1.5 ${
                  q.isActive
                    ? "bg-sky-600 text-white"
                    : q.isDone
                      ? "text-slate-600 line-through"
                      : "text-slate-400"
                }`}
              >
                <span className="truncate">{q.username ?? "Unknown"}</span>
                <span
                  className={`shrink-0 text-[10px] ${
                    q.isActive
                      ? "text-sky-100"
                      : q.isDone
                        ? "text-slate-600"
                        : "text-slate-500"
                  }`}
                >
                  {progressLabel}
                </span>
                {q.isActive && (
                  <span className="text-sky-200" aria-hidden>
                    ●
                  </span>
                )}
              </div>
            );
          })}
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
  onCreateGame: (
    rounds: GameRoundInput[],
    options?: CreateGameOptions,
  ) => void;
  onDeleteGame: (gameId: string) => void;
}) {
  const [creatingGame, setCreatingGame] = useState(false);

  if (creatingGame) {
    return (
      <RoundSetupForm
        title="Create game — your rounds"
        submitLabel="Create game"
        showCreatorOptions
        onSubmit={(rounds, options) => {
          onCreateGame(rounds, options);
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
        <div className="flex flex-col items-center gap-4 py-6">
          <div className="text-5xl">🔍</div>
          <div className="w-full rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm font-semibold text-slate-100 mb-2">
              How to play
            </div>
            <ol className="text-xs text-slate-400 leading-relaxed space-y-1.5 list-decimal pl-4">
              <li>
                <span className="text-slate-200 font-medium">Pick rounds.</span>{" "}
                For each round set a category, the secret answer, and an
                optional clue image.
              </li>
              <li>
                <span className="text-slate-200 font-medium">Invite friends.</span>{" "}
                Other players in this room can join as additional questioners
                with their own rounds.
              </li>
              <li>
                <span className="text-slate-200 font-medium">Take turns.</span>{" "}
                Guessers go one by one. The questioner can reveal letters as
                hints, skip a stuck guesser, or end the round.
              </li>
              <li>
                <span className="text-slate-200 font-medium">Win it.</span>{" "}
                Every correct guess earns a point. Highest score wins.
              </li>
            </ol>
            <div className="mt-3 pt-3 border-t border-white/10 text-[11px] text-slate-500">
              Typos and punctuation are forgiven — &ldquo;the matrix&rdquo; matches
              &ldquo;Matrix&rdquo;, &ldquo;cafe&rdquo; matches &ldquo;café&rdquo;.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCreatingGame(true)}
            className="px-5 py-2.5 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-500 transition-colors"
          >
            Create your first game
          </button>
        </div>
      ) : (
        // Stack on small screens; side-by-side cards on lg+ since each
        // card is short and the lobby has plenty of horizontal room.
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
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
                      {game.creatorName ?? "Unknown"}&rsquo;s game
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
  setObserver,
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
        onSetObserver={(observer) =>
          setObserver(selectedGame.gameId, observer)
        }
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
      onCreateGame={(rounds, options) => {
        createGame(rounds, options);
      }}
      onDeleteGame={(gameId) => resetGame(gameId)}
    />
  );
}
