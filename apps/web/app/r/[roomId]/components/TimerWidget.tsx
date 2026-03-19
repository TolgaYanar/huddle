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

  const isFinished = status === "finished" || (status !== "running" && displayMs <= 0);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-8 px-3 rounded-lg border text-xs font-mono font-semibold tabular-nums transition-colors ${
        isFinished
          ? "border-rose-500/50 bg-rose-500/15 text-rose-300 animate-pulse"
          : status === "running"
          ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-200 hover:bg-indigo-500/20"
          : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
      }`}
      title="Open timer"
    >
      {isFinished ? "Time's up!" : formatTimer(displayMs)}
    </button>
  );
}
