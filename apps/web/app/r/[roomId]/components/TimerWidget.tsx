"use client";

import React from "react";
import { formatTimer, type TimerState } from "../hooks/useTimer";

export function TimerWidget({
  timer,
  onClick,
}: {
  timer: TimerState;
  onClick: () => void;
}) {
  const { status, displayMs } = timer;
  if (status === "idle") return null;

  const isFinished =
    status === "finished" || (status !== "running" && displayMs <= 0);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-8 px-3 rounded-[var(--radius-control)] border text-xs font-mono font-semibold tabular-nums transition-colors ${
        isFinished
          ? "border-rose-500/50 bg-negative-soft text-negative animate-pulse"
          : status === "running"
            ? "border-accent bg-accent-soft text-accent hover:bg-accent-soft"
            : "border-hairline bg-surface text-ink-muted hover:bg-raised"
      }`}
      title="Open timer"
    >
      {isFinished ? "Time's up!" : formatTimer(displayMs)}
    </button>
  );
}
