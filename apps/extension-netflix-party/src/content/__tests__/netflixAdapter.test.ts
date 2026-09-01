import { afterEach, describe, expect, it, vi } from "vitest";

const commandMocks = vi.hoisted(() => ({
  seek: vi.fn(() => Promise.resolve({ ok: true })),
  setPlaying: vi.fn(() => Promise.resolve({ ok: true })),
}));

vi.mock("../netflixBackground", () => ({
  safeNetflixSeekViaBackground: commandMocks.seek,
  safeNetflixSetPlayingViaBackground: commandMocks.setPlaying,
}));

vi.mock("../metadata", () => ({
  extractNetflixMetadata: vi.fn(() => ({
    title: "Title",
    posterUrl: null,
    episode: "Episode",
  })),
}));

vi.mock("../video", () => ({ getBestVideo: vi.fn() }));

import { netflixAdapter } from "../platforms/netflix";

describe("Netflix platform adapter", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("accepts only genuine Netflix watch URLs and extracts their identity", () => {
    expect(
      netflixAdapter.getContentIdFromUrl(
        "https://www.netflix.com/watch/81628497?trackId=1",
      ),
    ).toBe("81628497");
    expect(
      netflixAdapter.isPlaybackUrl("https://www.netflix.com/watch/1"),
    ).toBe(true);

    for (const spoof of [
      "https://notnetflix.com/watch/1",
      "https://www.netflix.com.evil.test/watch/1",
      "http://www.netflix.com/watch/1",
      "https://www.netflix.com/browse",
    ]) {
      expect(netflixAdapter.isPlaybackUrl(spoof)).toBe(false);
      expect(netflixAdapter.getContentIdFromUrl(spoof)).toBeNull();
    }
  });

  it("reads the current identity from the live location", () => {
    vi.stubGlobal("location", {
      href: "https://www.netflix.com/watch/100?foo=bar",
    });
    expect(netflixAdapter.getCurrentContentId()).toBe("100");
  });

  it("keeps Netflix's privileged seek and play commands behind the adapter", async () => {
    await netflixAdapter.seek(42);
    await netflixAdapter.play();
    expect(commandMocks.seek).toHaveBeenCalledWith(42);
    expect(commandMocks.setPlaying).toHaveBeenCalledWith(true);
  });

  it("reports SPA navigation as a possible identity change and cleans up", () => {
    const listeners = new Map<string, () => void>();
    const originalPush = vi.fn();
    const originalReplace = vi.fn();
    const fakeHistory = {
      pushState: originalPush,
      replaceState: originalReplace,
    };
    vi.stubGlobal("history", fakeHistory);
    vi.stubGlobal("window", {
      addEventListener: vi.fn((name: string, listener: () => void) => {
        listeners.set(name, listener);
      }),
      removeEventListener: vi.fn((name: string) => listeners.delete(name)),
    });

    const onPotentialChange = vi.fn();
    const unsubscribe =
      netflixAdapter.subscribeToPotentialContentChanges(onPotentialChange);

    fakeHistory.pushState({}, "", "/watch/2");
    fakeHistory.replaceState({}, "", "/watch/3");
    listeners.get("popstate")?.();
    expect(onPotentialChange).toHaveBeenCalledTimes(3);

    unsubscribe();
    expect(fakeHistory.pushState).toBe(originalPush);
    expect(fakeHistory.replaceState).toBe(originalReplace);
    expect(listeners.has("popstate")).toBe(false);
  });
});
