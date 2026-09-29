import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  holdRemoteSyncGuard,
  releaseRemoteSyncGuard,
} from "../remoteSyncGuard";

describe("remote sync guard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("raises the guard and lowers it after the hold", () => {
    const guard = { current: false };
    holdRemoteSyncGuard(guard, 350);
    expect(guard.current).toBe(true);
    vi.advanceTimersByTime(349);
    expect(guard.current).toBe(true);
    vi.advanceTimersByTime(1);
    expect(guard.current).toBe(false);
  });

  it("does not let an earlier short hold drop a later longer one", () => {
    const guard = { current: false };
    holdRemoteSyncGuard(guard, 350); // catch-up seek at t=0
    vi.advanceTimersByTime(300);
    holdRemoteSyncGuard(guard, 400); // room state at t=300, until t=700
    vi.advanceTimersByTime(50); // t=350: the catch-up's release fires
    expect(guard.current).toBe(true);
    vi.advanceTimersByTime(349); // t=699
    expect(guard.current).toBe(true);
    vi.advanceTimersByTime(1); // t=700
    expect(guard.current).toBe(false);
  });

  it("release drops every hold immediately", () => {
    const guard = { current: false };
    holdRemoteSyncGuard(guard, 1000);
    releaseRemoteSyncGuard(guard);
    expect(guard.current).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(guard.current).toBe(false);
  });
});
