"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TimerStateData } from "shared-logic";

export type TimerState = {
  status: TimerStateData["status"];
  durationMs: number;
  remainingMs: number;
  endsAt: number | null;
  /** Estimated remaining ms adjusted for clock offset */
  displayMs: number;
};

const DEFAULT_STATE: TimerState = {
  status: "idle",
  durationMs: 25 * 60 * 1000,
  remainingMs: 25 * 60 * 1000,
  endsAt: null,
  displayMs: 25 * 60 * 1000,
};

export function useTimer({
  onTimerState,
}: {
  onTimerState: (cb: (data: TimerStateData) => void) => (() => void) | undefined;
}) {
  const [timer, setTimer] = useState<TimerState>(DEFAULT_STATE);
  const clockOffsetRef = useRef(0); // client - server
  const rafRef = useRef<number | null>(null);

  // Subscribe to server timer events.
  useEffect(() => {
    const cleanup = onTimerState((data) => {
      clockOffsetRef.current = Date.now() - data.serverNow;
      setTimer({
        status: data.status,
        durationMs: data.durationMs,
        remainingMs: data.remainingMs,
        endsAt: data.endsAt,
        displayMs: computeDisplayMs(data, clockOffsetRef.current),
      });
    });
    return () => cleanup?.();
  }, [onTimerState]);

  // RAF loop to update displayMs every ~250ms when running.
  useEffect(() => {
    if (timer.status !== "running" || timer.endsAt === null) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    let lastTick = 0;
    const tick = (now: number) => {
      if (now - lastTick >= 250) {
        lastTick = now;
        setTimer((prev) => {
          if (prev.endsAt === null) return prev;
          const adjusted = prev.endsAt - (Date.now() - clockOffsetRef.current);
          const displayMs = Math.max(0, adjusted);
          return displayMs === prev.displayMs ? prev : { ...prev, displayMs };
        });
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [timer.status, timer.endsAt]);

  return { timer };
}

function computeDisplayMs(data: TimerStateData, clockOffset: number): number {
  if (data.status === "running" && data.endsAt !== null) {
    return Math.max(0, data.endsAt - (Date.now() - clockOffset));
  }
  return data.remainingMs;
}

export function formatTimer(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
