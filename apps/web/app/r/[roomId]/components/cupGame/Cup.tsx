"use client";

import React from "react";

import type { CupGameCup } from "shared-logic";

export type CupRole =
  | "idle"
  | "selectable"
  | "mineSpider"
  | "placement-empty"
  | "placement-mine"
  | "placement-disabled"
  | "block-corner"
  | "row-target"
  | "relocate-src"
  | "relocate-dst-eligible";

/**
 * A cup is rendered as a stack of CSS layers:
 *   - <floor>     : drop shadow on the imaginary table
 *   - <cup>       : the trapezoidal body (gradient + lighting)
 *     - <rim>     : raised dome at the top (the cup is inverted, mouth-down)
 *     - <gloss>   : highlight stripe down the left for depth
 *     - <marker>  : optional 🕷 badge on cups you placed yourself
 *   - <reveal>    : what's underneath, shown when status === "flipped"
 *
 * `transform-style: preserve-3d` + a perspective-set parent does the rest.
 * On flip we lift, tilt, and fade the cup out while the reveal eases in.
 */

const ROLE_PALETTE: Record<CupRole, { top: string; bottom: string; rim: string; shadow: string; ring?: string }> = {
  // Default cup — saturated red plastic, carnival-game vibe.
  idle: { top: "#ff8a6b", bottom: "#a13322", rim: "#b94027", shadow: "rgba(0,0,0,0.5)" },
  selectable: { top: "#ffb18a", bottom: "#c14a30", rim: "#d8553a", shadow: "rgba(255,140,90,0.55)", ring: "0 0 0 2px rgba(255,180,140,0.55), 0 0 22px -4px rgba(255,160,110,0.6)" },
  // Your own hidden spider — purple to remember.
  mineSpider: { top: "#e879f9", bottom: "#7c2d92", rim: "#a02db6", shadow: "rgba(232,121,249,0.45)", ring: "0 0 0 2px rgba(232,121,249,0.55)" },
  "placement-empty": { top: "#ff8a6b", bottom: "#a13322", rim: "#b94027", shadow: "rgba(0,0,0,0.5)" },
  "placement-mine": { top: "#e879f9", bottom: "#7c2d92", rim: "#a02db6", shadow: "rgba(232,121,249,0.5)", ring: "0 0 0 2px rgba(232,121,249,0.6)" },
  "placement-disabled": { top: "#9aa3b2", bottom: "#3f4756", rim: "#5a6273", shadow: "rgba(0,0,0,0.4)" },
  "block-corner": { top: "#fcd34d", bottom: "#a16207", rim: "#b45309", shadow: "rgba(252,211,77,0.5)", ring: "0 0 0 2px rgba(252,211,77,0.55)" },
  "row-target": { top: "#fcd34d", bottom: "#a16207", rim: "#b45309", shadow: "rgba(252,211,77,0.4)" },
  "relocate-src": { top: "#f0abfc", bottom: "#86198f", rim: "#a21caf", shadow: "rgba(240,171,252,0.6)", ring: "0 0 0 3px rgba(240,171,252,0.7)" },
  "relocate-dst-eligible": { top: "#86efac", bottom: "#166534", rim: "#15803d", shadow: "rgba(134,239,172,0.45)", ring: "0 0 0 2px rgba(134,239,172,0.5)" },
};

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
    !isFlipped && (
      role === "selectable" ||
      role === "block-corner" ||
      role === "row-target" ||
      role === "placement-empty" ||
      role === "placement-mine" ||
      role === "relocate-src" ||
      role === "relocate-dst-eligible" ||
      role === "mineSpider"
    );

  const palette = ROLE_PALETTE[role] ?? ROLE_PALETTE.idle;
  const showMineMarker = !isFlipped && (role === "placement-mine" || role === "mineSpider" || role === "relocate-src");

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
        "cup-stage",
        interactive ? "cup-stage-interactive" : "",
        recentlyFlipped ? "cup-stage-flipping" : "",
      ].join(" ")}
    >
      {/* Floor shadow */}
      <span
        className="cup-floor-shadow"
        style={{ background: `radial-gradient(ellipse, ${palette.shadow}, transparent 70%)` }}
        aria-hidden
      />

      {/* The 3D cup itself (hidden once flipped). */}
      {!isFlipped && (
        <span
          className={[
            "cup-3d",
            role === "idle" || role === "placement-disabled" ? "" : "cup-3d-bob",
            hitOnFlip ? "cup-hit-shake" : "",
            shieldedOnFlip ? "cup-shielded" : "",
          ].join(" ")}
          aria-hidden
        >
          {/* Body — trapezoidal cup walls */}
          <span
            className="cup-body"
            style={{
              background: `linear-gradient(180deg, ${palette.top} 0%, ${palette.bottom} 100%)`,
              boxShadow: palette.ring,
            }}
          >
            {/* Side gloss highlight */}
            <span className="cup-gloss" />
            {/* Side shading */}
            <span className="cup-side-shade" />
          </span>
          {/* Top dome (bottom of the inverted cup, now facing up) */}
          <span
            className="cup-rim"
            style={{
              background: `radial-gradient(ellipse at 35% 35%, rgba(255,255,255,0.45), transparent 55%), linear-gradient(180deg, ${palette.top} 0%, ${palette.rim} 100%)`,
            }}
          />
          {/* Mine marker */}
          {showMineMarker && (
            <span className="cup-mine-marker" aria-hidden>
              🕷
            </span>
          )}
        </span>
      )}

      {/* Reveal — only mounted once the cup has flipped, animates in. */}
      {isFlipped && (
        <span className={`cup-reveal ${isSpider ? "cup-reveal-spider" : "cup-reveal-empty"}`} aria-hidden>
          {isSpider ? (
            <span className="cup-spider-icon">🕷️</span>
          ) : (
            <span className="cup-empty-icon">·</span>
          )}
        </span>
      )}
    </button>
  );
}
