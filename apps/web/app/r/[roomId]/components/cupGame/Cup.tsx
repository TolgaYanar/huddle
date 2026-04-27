"use client";

import React from "react";

import type { CupGameCup } from "shared-logic";

export type CupRole =
  | "idle" // hidden, not interactive (someone else's turn)
  | "selectable" // hidden, current player can flip / pick
  | "mineSpider" // hidden, you placed your own spider here (during play)
  | "placement-empty" // placement phase: no spider here
  | "placement-mine" // placement phase: your spider here
  | "placement-disabled" // placement phase: someone else's spider OR locked
  | "block-corner" // hover-preview for 2×2 pick
  | "row-target" // hover-preview for row pick
  | "relocate-src" // chosen as relocate source
  | "relocate-dst-eligible"; // valid relocate destination

export function Cup({
  cup,
  role,
  onClick,
  recentlyFlipped,
  hitOnFlip,
  shieldedOnFlip,
}: {
  cup: CupGameCup;
  role: CupRole;
  onClick?: () => void;
  recentlyFlipped?: boolean;
  hitOnFlip?: boolean;
  shieldedOnFlip?: boolean;
}) {
  const isFlipped = cup.status === "flipped";
  const isSpider = isFlipped && cup.revealedAs === "spider";

  const interactive =
    role === "selectable" ||
    role === "block-corner" ||
    role === "row-target" ||
    role === "placement-empty" ||
    role === "placement-mine" ||
    role === "relocate-src" ||
    role === "relocate-dst-eligible" ||
    role === "mineSpider";

  // Frame styling per role on the hidden side.
  const frameClass = (() => {
    if (isFlipped) {
      return isSpider
        ? "border-rose-500/60 bg-rose-950/60 shadow-[0_0_24px_-4px_rgba(244,63,94,0.6)]"
        : "border-emerald-500/40 bg-emerald-950/40";
    }
    if (role === "placement-mine" || role === "mineSpider")
      return "border-fuchsia-400/70 bg-fuchsia-900/40 shadow-[0_0_18px_-6px_rgba(232,121,249,0.6)]";
    if (role === "placement-disabled")
      return "border-white/5 bg-slate-900/40";
    if (role === "selectable")
      return "border-sky-400/30 bg-slate-800/70 hover:border-sky-300/70 hover:bg-slate-700/70 hover:scale-[1.04] active:scale-[0.97]";
    if (role === "block-corner")
      return "border-amber-400/60 bg-amber-900/40 hover:border-amber-300";
    if (role === "row-target")
      return "border-amber-400/60 bg-amber-900/30";
    if (role === "relocate-src")
      return "border-fuchsia-400 bg-fuchsia-900/60 ring-2 ring-fuchsia-400/40";
    if (role === "relocate-dst-eligible")
      return "border-emerald-400/50 bg-slate-800/60 hover:border-emerald-300/80 hover:bg-emerald-900/30";
    return "border-white/10 bg-slate-900/50";
  })();

  return (
    <button
      type="button"
      onClick={interactive ? onClick : undefined}
      disabled={!interactive}
      aria-label={
        isFlipped
          ? isSpider
            ? `Cup ${cup.index + 1} — spider`
            : `Cup ${cup.index + 1} — empty`
          : `Cup ${cup.index + 1}`
      }
      className={[
        "relative aspect-square rounded-xl border transition-all duration-150 select-none",
        "flex items-center justify-center",
        "[transform-style:preserve-3d]",
        recentlyFlipped ? "cup-flip-animate" : "",
        hitOnFlip ? "cup-hit-shake" : "",
        shieldedOnFlip ? "cup-shielded" : "",
        frameClass,
        interactive ? "cursor-pointer" : "cursor-default",
      ].join(" ")}
    >
      {/* Hidden face */}
      {!isFlipped && (
        <span className="text-2xl sm:text-3xl select-none" aria-hidden>
          🥤
        </span>
      )}
      {!isFlipped && (role === "placement-mine" || role === "mineSpider") && (
        <span
          className="absolute -top-1 -right-1 text-base bg-fuchsia-500/90 text-white rounded-full w-5 h-5 inline-flex items-center justify-center shadow"
          aria-hidden
        >
          🕷
        </span>
      )}

      {/* Flipped face */}
      {isFlipped && (
        <span className="text-2xl sm:text-3xl drop-shadow-md" aria-hidden>
          {isSpider ? "🕷️" : "·"}
        </span>
      )}
    </button>
  );
}
