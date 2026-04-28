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
  return (
    document.querySelector('[role="dialog"][aria-modal="true"]') !== null
  );
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
}) {
  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      if (isTyping()) return;
      if (isModalOpen()) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key) {
        case " ":
        case "k": {
          e.preventDefault();
          if (!canControlPlayback) return;
          if (isPlaying) {
            handleUserPause();
          } else {
            handleUserPlay();
          }
          break;
        }
        case "ArrowLeft": {
          e.preventDefault();
          if (!canControlPlayback) return;
          handleSeekFromController(Math.max(0, currentTime - 10), {
            force: true,
          });
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          if (!canControlPlayback) return;
          handleSeekFromController(currentTime + 10, { force: true });
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const nextVol = Math.min(1, volume + 0.1);
          handleVolumeFromController(nextVol, effectiveMuted);
          break;
        }
        case "ArrowDown": {
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
  ]);
}
