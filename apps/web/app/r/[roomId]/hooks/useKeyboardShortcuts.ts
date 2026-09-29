"use client";

import { useEffect } from "react";

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function isTyping(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  if (TYPING_TAGS.has(el.tagName)) return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

// Space activates a focused button/link/checkbox natively; stealing it for
// play/pause meant a keyboard user pressing Space on "Send" or the mic toggle
// toggled the room video instead.
const SPACE_OWNERS =
  'button, a[href], summary, [role="button"], [role="checkbox"], [role="switch"], [role="menuitem"], [role="option"], [role="tab"], [role="radio"]';

// Widgets that move with the arrow keys themselves.
const ARROW_OWNERS =
  '[role="slider"], [role="tab"], [role="menuitem"], [role="option"], [role="radio"], [role="listbox"], [role="menu"], [role="tablist"], [role="radiogroup"]';

function focusedMatches(selector: string): boolean {
  const el = document.activeElement;
  if (!el || el === document.body) return false;
  return el.closest(selector) !== null;
}

/**
 * Whenever a modal is open the user is interacting with it, not the video —
 * so global player shortcuts (space = play/pause, arrows = seek, etc.) need
 * to stay quiet. Without this guard, pressing space while a modal button is
 * focused would re-activate the focused button AND pause the video, which is
 * exactly the "the game UI keeps pausing my video" complaint.
 *
 * We rely on the shared Modal shell setting `role="dialog" aria-modal="true"`
 * — that's the contract every dialog in the room view honors.
 */
function isModalOpen(): boolean {
  return document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
}

export function useKeyboardShortcuts({
  enabled,
  canControlPlayback,
  isPlaying,
  currentTime,
  volume,
  effectiveMuted,
  handleUserPlay,
  handleUserPause,
  handleSeekFromController,
  handleVolumeFromController,
  toggleLocalMute,
  togglePlayerFullscreen,
  toggleTheatreMode,
}: {
  enabled: boolean;
  canControlPlayback: boolean;
  isPlaying: boolean;
  currentTime: number;
  volume: number;
  effectiveMuted: boolean;
  handleUserPlay: () => void;
  handleUserPause: () => void;
  handleSeekFromController: (time: number, opts?: { force?: boolean }) => void;
  handleVolumeFromController: (volume: number, muted: boolean) => void;
  toggleLocalMute: () => void;
  togglePlayerFullscreen: () => void;
  toggleTheatreMode?: () => void;
}) {
  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      // A capture-phase feature such as push-to-talk may already own this
      // gesture. Respect that ownership so the default Space PTT binding does
      // not also play/pause the room video.
      if (e.defaultPrevented) return;
      if (isTyping()) return;
      if (isModalOpen()) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key) {
        case " ":
        case "k": {
          if (e.key === " " && focusedMatches(SPACE_OWNERS)) return;
          if (!canControlPlayback) return;
          e.preventDefault();
          if (isPlaying) {
            handleUserPause();
          } else {
            handleUserPlay();
          }
          break;
        }
        case "ArrowLeft": {
          if (focusedMatches(ARROW_OWNERS)) return;
          e.preventDefault();
          if (!canControlPlayback) return;
          handleSeekFromController(Math.max(0, currentTime - 10), {
            force: true,
          });
          break;
        }
        case "ArrowRight": {
          if (focusedMatches(ARROW_OWNERS)) return;
          e.preventDefault();
          if (!canControlPlayback) return;
          handleSeekFromController(currentTime + 10, { force: true });
          break;
        }
        case "ArrowUp": {
          if (focusedMatches(ARROW_OWNERS)) return;
          e.preventDefault();
          const nextVol = Math.min(1, volume + 0.1);
          handleVolumeFromController(nextVol, effectiveMuted);
          break;
        }
        case "ArrowDown": {
          if (focusedMatches(ARROW_OWNERS)) return;
          e.preventDefault();
          const nextVol = Math.max(0, volume - 0.1);
          handleVolumeFromController(nextVol, effectiveMuted);
          break;
        }
        case "m":
        case "M": {
          e.preventDefault();
          toggleLocalMute();
          break;
        }
        case "f":
        case "F": {
          e.preventDefault();
          togglePlayerFullscreen();
          break;
        }
        case "t":
        case "T": {
          if (!toggleTheatreMode) return;
          e.preventDefault();
          toggleTheatreMode();
          break;
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    enabled,
    canControlPlayback,
    isPlaying,
    currentTime,
    volume,
    effectiveMuted,
    handleUserPlay,
    handleUserPause,
    handleSeekFromController,
    handleVolumeFromController,
    toggleLocalMute,
    togglePlayerFullscreen,
    toggleTheatreMode,
  ]);
}
