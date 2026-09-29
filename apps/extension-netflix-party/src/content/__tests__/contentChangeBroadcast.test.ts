import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createInitialState } from "../state";

const platform = vi.hoisted(() => ({
  contentId: "100" as string | null,
  onPotentialChange: null as null | (() => void),
  getPlayer: vi.fn(() => null),
  observerCallback: null as null | (() => void),
}));

vi.mock("../video", () => ({
  computeDesiredTimestampNow: vi.fn(() => null),
}));

vi.mock("../platforms", () => ({
  getActivePlatformAdapter: () => ({
    id: "netflix",
    displayName: "Netflix",
    getPlayer: platform.getPlayer,
    getContentIdFromUrl: () => platform.contentId,
    getCurrentContentId: () => platform.contentId,
    isPlaybackUrl: () => true,
    formatContentId: (id: string) => `/watch/${id}`,
    getNavigationUrl: (url: string) => url,
    requiresVerifiedContentIdentity: false,
    getMetadata: vi.fn(),
    subscribeToPotentialContentChanges: (cb: () => void) => {
      platform.onPotentialChange = cb;
      return () => {};
    },
  }),
}));

import { ensureVideoListeners } from "../playerSync";

describe("content change broadcast", () => {
  const loc = { href: "https://www.netflix.com/watch/100" };

  beforeEach(() => {
    platform.contentId = "100";
    platform.onPotentialChange = null;
    loc.href = "https://www.netflix.com/watch/100";
    vi.stubGlobal("location", loc);
    vi.stubGlobal(
      "MutationObserver",
      class {
        constructor(cb: () => void) {
          platform.observerCallback = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    vi.stubGlobal("document", { documentElement: {} });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function setup() {
    const emitSync = vi.fn();
    ensureVideoListeners(createInitialState(), {
      emitSync,
      shouldEmitLocalSync: () => true,
    });
    return emitSync;
  }

  it("does not restart the room when only the query string changes", () => {
    const emitSync = setup();
    loc.href = "https://www.netflix.com/watch/100?trackId=123";
    platform.onPotentialChange?.();
    expect(emitSync).not.toHaveBeenCalled();
  });

  it("broadcasts a real title change once", () => {
    const emitSync = setup();
    platform.contentId = "200";
    loc.href = "https://www.netflix.com/watch/200";
    platform.onPotentialChange?.();
    loc.href = "https://www.netflix.com/watch/200?trackId=9";
    platform.onPotentialChange?.();
    expect(emitSync).toHaveBeenCalledTimes(1);
    expect(emitSync).toHaveBeenCalledWith("change_url", 0);
  });

  it("coalesces bursts of DOM mutations into one player lookup", () => {
    vi.useFakeTimers();
    try {
      setup();
      platform.getPlayer.mockClear();
      for (let i = 0; i < 50; i += 1) platform.observerCallback?.();
      expect(platform.getPlayer).not.toHaveBeenCalled();
      vi.advanceTimersByTime(150);
      expect(platform.getPlayer).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
