"use client";

import React from "react";
import { formatTimer, type TimerState } from "../hooks/useTimer";

const PRESETS = [
  { label: "5 min", ms: 5 * 60 * 1000 },
  { label: "10 min", ms: 10 * 60 * 1000 },
  { label: "15 min", ms: 15 * 60 * 1000 },
  { label: "25 min", ms: 25 * 60 * 1000 },
  { label: "30 min", ms: 30 * 60 * 1000 },
  { label: "45 min", ms: 45 * 60 * 1000 },
];

export type TimerModalProps = {
  open: boolean;
  onClose: () => void;
  timer: TimerState;
  onSetDuration: (ms: number) => void;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  isConnected: boolean;
};

export function TimerModal({
  open,
  onClose,
  timer,
  onSetDuration,
  onStart,
  onPause,
  onReset,
  isConnected,
}: TimerModalProps) {
  const [customMin, setCustomMin] = React.useState("");

  if (!open) return null;

  const { status, durationMs, displayMs } = timer;
  const isRunning = status === "running";
  const isIdle = status === "idle";
  const isFinished = status === "finished" || (status !== "running" && displayMs <= 0 && durationMs > 0);

  // Progress arc (0 = empty, 1 = full)
  const progress = durationMs > 0 ? Math.max(0, Math.min(1, displayMs / durationMs)) : 1;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-sm bg-slate-900/95 border border-white/10 rounded-2xl shadow-2xl p-6 flex flex-col gap-5"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-100">Shared timer</h2>
            <button
              type="button"
              onClick={onClose}
              className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Clock face */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative w-36 h-36">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 128 128">
                {/* Track */}
                <circle
                  cx="64" cy="64" r={radius}
                  fill="none"
                  stroke="rgba(255,255,255,0.07)"
                  strokeWidth="8"
                />
                {/* Progress */}
                <circle
                  cx="64" cy="64" r={radius}
                  fill="none"
                  stroke={isFinished ? "#f87171" : "#818cf8"}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  className="transition-all duration-300"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-3xl font-mono font-bold tabular-nums ${isFinished ? "text-rose-400" : "text-slate-100"}`}>
                  {formatTimer(displayMs)}
                </span>
                <span className="text-xs text-slate-500 mt-0.5 capitalize">{status}</span>
              </div>
            </div>

            {isFinished && (
              <p className="text-sm text-rose-300 font-medium">Time&apos;s up!</p>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={onReset}
              disabled={!isConnected || isIdle}
              className="h-9 px-4 rounded-xl border border-white/10 bg-white/5 text-slate-300 text-sm font-medium hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Reset
            </button>

            {isRunning ? (
              <button
                type="button"
                onClick={onPause}
                disabled={!isConnected}
                className="h-9 px-5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200 text-sm font-semibold hover:bg-amber-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Pause
              </button>
            ) : (
              <button
                type="button"
                onClick={onStart}
                disabled={!isConnected || displayMs <= 0}
                className="h-9 px-5 rounded-xl border border-indigo-500/40 bg-indigo-500/20 text-indigo-200 text-sm font-semibold hover:bg-indigo-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {status === "paused" ? "Resume" : "Start"}
              </button>
            )}
          </div>

          <div className="border-t border-white/10" />

          {/* Presets */}
          <div>
            <p className="text-xs text-slate-500 mb-2">Presets</p>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.ms}
                  type="button"
                  onClick={() => onSetDuration(p.ms)}
                  disabled={!isConnected}
                  className={`h-7 px-3 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    durationMs === p.ms
                      ? "border border-indigo-500/50 bg-indigo-500/20 text-indigo-200"
                      : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom duration */}
          <div>
            <p className="text-xs text-slate-500 mb-2">Custom (minutes)</p>
            <div className="flex gap-2">
              <input
                type="number"
                min="1"
                max="1440"
                value={customMin}
                onChange={(e) => setCustomMin(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const n = Number(customMin);
                    if (n > 0 && n <= 1440) {
                      onSetDuration(n * 60 * 1000);
                      setCustomMin("");
                    }
                  }
                }}
                placeholder="e.g. 45"
                className="flex-1 h-9 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
              <button
                type="button"
                disabled={!isConnected || !customMin || Number(customMin) <= 0}
                onClick={() => {
                  const n = Number(customMin);
                  if (n > 0 && n <= 1440) {
                    onSetDuration(n * 60 * 1000);
                    setCustomMin("");
                  }
                }}
                className="h-9 px-3 rounded-xl border border-white/10 bg-indigo-500/20 text-indigo-200 text-sm font-medium hover:bg-indigo-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Set
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
