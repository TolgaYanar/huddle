import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { copyText, useClipboard } from "../useClipboard";

describe("copyText", () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
  });

  it("returns false for empty string", async () => {
    expect(await copyText("")).toBe(false);
  });

  it("uses navigator.clipboard.writeText when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    expect(await copyText("hello")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("falls back to execCommand when navigator.clipboard rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const exec = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      writable: true,
      value: exec,
    });

    expect(await copyText("hello")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
    expect(exec).toHaveBeenCalledWith("copy");
  });

  it("falls back to execCommand when navigator.clipboard is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    const exec = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      writable: true,
      value: exec,
    });

    expect(await copyText("yo")).toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
  });

  it("returns false when execCommand fails", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue(false),
    });

    expect(await copyText("yo")).toBe(false);
  });
});

describe("useClipboard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("flips copied true on success then back to false after resetMs", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    const { result } = renderHook(() => useClipboard({ resetMs: 500 }));
    expect(result.current.copied).toBe(false);

    await act(async () => {
      await result.current.copy("test");
    });
    expect(result.current.copied).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.copied).toBe(false);
  });

  it("sets error and stays not-copied when copy fails", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue(false),
    });

    const { result } = renderHook(() => useClipboard());

    await act(async () => {
      await result.current.copy("nope");
    });
    expect(result.current.copied).toBe(false);
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it("reset() clears state and pending timers", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    const { result } = renderHook(() => useClipboard());

    await act(async () => {
      await result.current.copy("test");
    });
    expect(result.current.copied).toBe(true);

    act(() => result.current.reset());
    expect(result.current.copied).toBe(false);
    expect(result.current.error).toBe(null);
  });
});
