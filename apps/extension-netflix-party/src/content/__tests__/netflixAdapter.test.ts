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

  it("can safely navigate to a verified Netflix watch URL", () => {
    expect(
      netflixAdapter.getNavigationUrl(
        "https://www.netflix.com/watch/200",
        "200",
      ),
    ).toBe("https://www.netflix.com/watch/200");
    expect(
      netflixAdapter.getNavigationUrl("https://example.com/watch/200", "200"),
    ).toBeNull();
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

  it("reports a page-driven URL change it could not intercept", () => {
    vi.useFakeTimers();
    try {
      const listeners = new Map<string, () => void>();
      const loc = { href: "https://www.netflix.com/watch/1" };
      vi.stubGlobal("location", loc);
      vi.stubGlobal("window", {
        addEventListener: vi.fn((name: string, listener: () => void) => {
          listeners.set(name, listener);
        }),
        removeEventListener: vi.fn((name: string) => listeners.delete(name)),
      });

      const onPotentialChange = vi.fn();
      const unsubscribe =
        netflixAdapter.subscribeToPotentialContentChanges(onPotentialChange);

      // Netflix's own pushState runs in the page world; all the content
      // script can observe is the URL changing under it.
      vi.advanceTimersByTime(1000);
      expect(onPotentialChange).not.toHaveBeenCalled();
      loc.href = "https://www.netflix.com/watch/2";
      vi.advanceTimersByTime(1000);
      expect(onPotentialChange).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(3000);
      expect(onPotentialChange).toHaveBeenCalledTimes(1);

      // Back/forward is reported immediately, and not again by the poll.
      loc.href = "https://www.netflix.com/watch/1";
      listeners.get("popstate")?.();
      vi.advanceTimersByTime(1000);
      expect(onPotentialChange).toHaveBeenCalledTimes(2);

      unsubscribe();
      loc.href = "https://www.netflix.com/watch/3";
      vi.advanceTimersByTime(5000);
      expect(onPotentialChange).toHaveBeenCalledTimes(2);
      expect(listeners.has("popstate")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
