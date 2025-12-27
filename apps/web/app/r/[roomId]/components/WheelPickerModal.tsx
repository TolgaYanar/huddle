"use client";

import React from "react";

export type WheelSpin = {
  roomId: string;
  index: number;
  result: string;
  entryCount: number;
  spunAt: number;
  senderId?: string;
  entries?: string[];
};

const SPIN_MS = 3600;

function colorForIndex(i: number) {
  const hue = (i * 47) % 360;
  return {
    chip: `hsl(${hue} 90% 60% / 0.22)`,
    border: `hsl(${hue} 90% 60% / 0.35)`,
    wedge: `hsl(${hue} 90% 55% / 0.38)`,
  };
}

function buildWheelGradient(count: number) {
  if (count <= 0) {
    return "conic-gradient(rgba(255,255,255,0.10), rgba(255,255,255,0.10))";
  }

  if (count > 80) {
    return "repeating-conic-gradient(rgba(255,255,255,0.12) 0deg 6deg, rgba(255,255,255,0.06) 6deg 12deg)";
  }

  const per = 360 / count;
  const stops: string[] = [];
  for (let i = 0; i < count; i++) {
    const a0 = i * per;
    const a1 = (i + 1) * per;
    const c = colorForIndex(i).wedge;
    stops.push(`${c} ${a0}deg ${a1}deg`);
  }
  return `conic-gradient(${stops.join(", ")})`;
}

export function WheelPickerModal(props: {
  open: boolean;
  onClose: () => void;
  isConnected: boolean;

  entries: string[];
  lastSpin: WheelSpin | null;

  onAddEntry: (text: string) => void;
  onRemoveEntry: (index: number) => void;
  onClear: () => void;
  onSpin: () => void;
}) {
  const {
    open,
    onClose,
    isConnected,
    entries,
    lastSpin,
    onAddEntry,
    onRemoveEntry,
    onClear,
    onSpin,
  } = props;

  const [input, setInput] = React.useState("");
  const [wheelRotation, setWheelRotation] = React.useState(0);
  const wheelRotationRef = React.useRef(0);
  const [isSpinning, setIsSpinning] = React.useState(false);
  const [revealedPick, setRevealedPick] = React.useState<string | null>(null);
  const [frozenEntries, setFrozenEntries] = React.useState<string[]>([]);
  const revealTimerRef = React.useRef<number | null>(null);
  const lastSpinTokenRef = React.useRef<number | null>(null);

  const effectiveEntries = isSpinning ? frozenEntries : entries;

  const wheelBackground = React.useMemo(() => {
    return buildWheelGradient(effectiveEntries.length);
  }, [effectiveEntries.length]);

  React.useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  React.useEffect(() => {
    if (!open) return;
    if (!lastSpin) return;
    if (lastSpinTokenRef.current === lastSpin.spunAt) return;
    lastSpinTokenRef.current = lastSpin.spunAt;

    // Immediately start animating, but don't reveal result until the wheel stops.
    if (revealTimerRef.current) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }

    setIsSpinning(true);
    setRevealedPick(null);

    // Freeze the wheel to the entries snapshot used for this spin.
    if (Array.isArray(lastSpin.entries) && lastSpin.entries.length > 0) {
      setFrozenEntries(lastSpin.entries);
    } else {
      setFrozenEntries(entries);
    }

    const count =
      typeof lastSpin.entryCount === "number" && lastSpin.entryCount > 0
        ? lastSpin.entryCount
        : Array.isArray(lastSpin.entries) && lastSpin.entries.length > 0
          ? lastSpin.entries.length
          : entries.length;
    if (count <= 0) return;

    const seg = 360 / count;
    const index = Math.max(0, Math.min(count - 1, Math.floor(lastSpin.index)));
    const centerDeg = index * seg + seg / 2;
    const target = 360 - centerDeg;
    const extraTurns = 6 * 360;

    // We need the FINAL rotation (mod 360) to be `target`, regardless of current rotation.
    const currentMod = ((wheelRotationRef.current % 360) + 360) % 360;
    const desiredMod = ((target % 360) + 360) % 360;
    const delta = (desiredMod - currentMod + 360) % 360;

    const next = wheelRotationRef.current + extraTurns + delta;
    wheelRotationRef.current = next;
    setWheelRotation(next);

    revealTimerRef.current = window.setTimeout(() => {
      setIsSpinning(false);
      setRevealedPick(lastSpin.result);
    }, SPIN_MS);
  }, [open, lastSpin, entries]);

  React.useEffect(() => {
    if (!open) return;
    return () => {
      if (revealTimerRef.current) {
        window.clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    };
  }, [open]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const value = input.trim();
    if (!value) return;
    onAddEntry(value);
    setInput("");
  };

  if (!open) return null;

  const winnerIndex =
    typeof lastSpin?.index === "number" ? Math.floor(lastSpin.index) : null;
  const normalizedWinnerIndex =
    typeof winnerIndex === "number" &&
    Number.isFinite(winnerIndex) &&
    effectiveEntries.length > 0
      ? ((winnerIndex % effectiveEntries.length) + effectiveEntries.length) %
        effectiveEntries.length
      : null;
  const winnerColor =
    typeof normalizedWinnerIndex === "number"
      ? colorForIndex(normalizedWinnerIndex)
      : null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center px-6">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-4xl rounded-3xl border border-white/10 bg-black/40 shadow-xl overflow-hidden">
        <div className="p-5 border-b border-white/10 bg-black/20 flex items-center justify-between gap-4">
          <div>
            <div className="text-xl font-semibold text-slate-50">
              Wheel Picker
            </div>
            <div className="text-sm text-slate-300 mt-0.5">
              Add entries one by one, then spin.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClear}
              disabled={!isConnected || entries.length === 0 || isSpinning}
              className="h-10 px-4 rounded-xl border border-white/10 bg-white/5 text-slate-100 text-sm font-medium hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded-xl border border-white/10 bg-white/5 text-slate-100 text-sm font-medium hover:bg-white/10 transition-colors"
            >
              Close
            </button>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-6">
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-72 h-72">
              <div className="absolute left-1/2 -top-1 -translate-x-1/2 z-10 w-0 h-0 border-l-12 border-r-12 border-b-20 border-l-transparent border-r-transparent border-b-white/60" />

              <div className="absolute inset-0 rounded-full border border-white/10 bg-black/30 overflow-hidden">
                <div
                  className="w-full h-full"
                  style={{
                    background: wheelBackground,
                    transform: `rotate(${wheelRotation}deg)`,
                    transition: `transform ${SPIN_MS}ms cubic-bezier(0.15, 0.9, 0.15, 1)`,
                    willChange: "transform",
                  }}
                />
              </div>

              <div className="absolute inset-0 flex items-center justify-center">
                <div className="px-4 py-2 rounded-2xl border border-white/10 bg-black/60 text-sm text-slate-100">
                  {effectiveEntries.length} entries
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (!isConnected || entries.length === 0 || isSpinning) return;
                setIsSpinning(true);
                setRevealedPick(null);
                setFrozenEntries(entries);
                onSpin();
              }}
              disabled={!isConnected || entries.length === 0 || isSpinning}
              className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 text-slate-50 text-base font-semibold hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSpinning ? "Spinning…" : "Spin"}
            </button>

            <div className="w-full rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs uppercase tracking-wider font-bold text-slate-400">
                Result
              </div>
              <div className="mt-2 min-h-7 flex items-center gap-2">
                {winnerColor && revealedPick ? (
                  <span
                    className="inline-block w-3 h-3 rounded-full border"
                    style={{
                      background: winnerColor.chip,
                      borderColor: winnerColor.border,
                    }}
                    aria-hidden
                  />
                ) : null}
                <span className="text-lg text-slate-100 font-semibold">
                  {revealedPick ? revealedPick : isSpinning ? "…" : ""}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-400">
                Result appears only after the wheel stops.
              </div>
            </div>
          </div>

          <div className="flex flex-col min-h-0">
            <form onSubmit={handleAdd} className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isConnected ? "Add entry…" : "Connecting…"}
                disabled={!isConnected || isSpinning}
                className="flex-1 h-12 bg-black/30 border border-white/10 rounded-2xl px-4 text-base text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/25 focus:border-sky-500/30 transition disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!isConnected || isSpinning || !input.trim()}
                className="h-12 px-5 rounded-2xl border border-white/10 bg-white/5 text-slate-50 text-sm font-semibold hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </form>

            <div className="mt-4 flex-1 min-h-0 rounded-2xl border border-white/10 bg-black/20 overflow-hidden">
              <div className="p-3 border-b border-white/10 text-sm text-slate-300 flex items-center justify-between">
                <span>Entries</span>
                <span className="text-xs text-slate-500">Click remove</span>
              </div>
              <div className="max-h-105 overflow-y-auto divide-y divide-white/10">
                {effectiveEntries.length === 0 ? (
                  <div className="p-6 text-sm text-slate-500">
                    No entries yet.
                  </div>
                ) : (
                  effectiveEntries.map((entry, idx) => {
                    const c = colorForIndex(idx);
                    const isWinner =
                      Boolean(revealedPick) && normalizedWinnerIndex === idx;
                    return (
                      <div
                        key={`${idx}:${entry}`}
                        className={`flex items-center gap-3 px-4 py-3 ${
                          isWinner ? "bg-white/5" : ""
                        }`}
                      >
                        <div
                          className="w-3 h-3 rounded-full border"
                          style={{ background: c.chip, borderColor: c.border }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-slate-100 text-sm truncate">
                            {entry}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onRemoveEntry(idx)}
                          disabled={!isConnected || isSpinning}
                          className="h-9 px-3 rounded-xl border border-white/10 bg-white/5 text-slate-50 text-xs font-semibold hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
