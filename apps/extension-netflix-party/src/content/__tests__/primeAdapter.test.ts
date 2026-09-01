import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const videoMocks = vi.hoisted(() => ({
  getBestVideo: vi.fn(),
}));

let episodeInfoText =
  "S1 E2 The Mentalist: Season 1 Episode 2 Red Hair and Silver Tape";

vi.mock("../video", () => ({ getBestVideo: videoMocks.getBestVideo }));

import { parsePrimeEpisodeIdentity, primeAdapter } from "../platforms/prime";

function fakeVideo() {
  const listeners = new Map<string, EventListener>();
  return {
    currentTime: 10,
    play: vi.fn(() => Promise.resolve()),
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      listeners.set(type, listener);
    }),
    removeEventListener: vi.fn((type: string) => {
      listeners.delete(type);
    }),
    __listeners: listeners,
  } as unknown as HTMLVideoElement;
}

describe("Prime Video platform adapter", () => {
  beforeEach(() => {
    episodeInfoText =
      "S1 E2 The Mentalist: Season 1 Episode 2 Red Hair and Silver Tape";
    vi.stubGlobal("document", {
      title: "The Mentalist - Prime Video",
      documentElement: {},
      querySelector: vi.fn((selector: string) =>
        selector === ".atvwebplayersdk-episode-info"
          ? {
              textContent: episodeInfoText,
            }
          : null,
      ),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("recognises regional detail paths only on the exact Prime origin", () => {
    expect(
      primeAdapter.isPlaybackUrl(
        "https://www.primevideo.com/region/eu/detail/0J7QWO0J4F3V3KB4XSIJRBERI1",
      ),
    ).toBe(true);
    expect(
      primeAdapter.getContentIdFromUrl(
        "https://www.primevideo.com/region/eu/detail/0J7QWO0J4F3V3KB4XSIJRBERI1",
      ),
    ).toBe("prime:url:0J7QWO0J4F3V3KB4XSIJRBERI1");

    for (const spoof of [
      "https://primevideo.com.evil.test/detail/ABC",
      "https://www.primevideo.com/storefront/home",
      "http://www.primevideo.com/detail/ABC",
    ]) {
      expect(primeAdapter.isPlaybackUrl(spoof)).toBe(false);
    }
  });

  it("derives an anonymous live identity from series, season and episode", () => {
    const first = parsePrimeEpisodeIdentity(
      "S1 E2 The Mentalist: Season 1 Episode 2 Red Hair and Silver Tape",
      "The Mentalist - Prime Video",
    );
    const titleChanged = parsePrimeEpisodeIdentity(
      "S1 E2 The Mentalist: Season 1 Episode 2 A localized title",
      "The Mentalist - Prime Video",
    );
    const nextEpisode = parsePrimeEpisodeIdentity(
      "S1 E3 The Mentalist: Season 1 Episode 3 Red Tide",
      "The Mentalist - Prime Video",
    );

    expect(first).toMatch(/^prime:s1:e2:[a-z0-9]+$/);
    expect(titleChanged).toBe(first);
    expect(nextEpisode).not.toBe(first);
    expect(first).not.toContain("Mentalist");
  });

  it("fails closed when season, episode or series identity is unavailable", () => {
    expect(
      parsePrimeEpisodeIdentity("Red Hair and Silver Tape", ""),
    ).toBeNull();
    expect(parsePrimeEpisodeIdentity("S1 E2", "")).toBeNull();
    expect(parsePrimeEpisodeIdentity(null, "The Mentalist")).toBeNull();
  });

  it("uses the measured direct video commands", async () => {
    const player = fakeVideo();
    videoMocks.getBestVideo.mockReturnValue(player);

    await expect(primeAdapter.seek(128)).resolves.toEqual({ ok: true });
    expect(player.currentTime).toBe(128);
    await expect(primeAdapter.play()).resolves.toEqual({ ok: true });
    expect(player.play).toHaveBeenCalledOnce();
  });

  it("never claims it can navigate a stale URL to a live episode identity", () => {
    expect(
      primeAdapter.getNavigationUrl(
        "https://www.primevideo.com/detail/STALE",
        "prime:s1:e2:abc",
      ),
    ).toBeNull();
  });

  it("re-derives identity after Prime reuses the video for the next episode", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis);
    const player = fakeVideo() as HTMLVideoElement & {
      __listeners: Map<string, EventListener>;
    };
    videoMocks.getBestVideo.mockReturnValue(player);

    const observer = {
      observe: vi.fn(),
      disconnect: vi.fn(),
    };
    vi.stubGlobal(
      "MutationObserver",
      vi.fn(function MutationObserver() {
        return observer;
      }),
    );

    const onPotentialChange = vi.fn();
    const unsubscribe =
      primeAdapter.subscribeToPotentialContentChanges(onPotentialChange);

    player.__listeners.get("durationchange")?.(new Event("durationchange"));
    await vi.advanceTimersByTimeAsync(100);
    expect(onPotentialChange).not.toHaveBeenCalled();

    episodeInfoText = "S1 E3 The Mentalist: Season 1 Episode 3 Red Tide";
    await vi.advanceTimersByTimeAsync(150);
    expect(onPotentialChange).toHaveBeenCalledOnce();

    unsubscribe();
    expect(observer.disconnect).toHaveBeenCalledOnce();
    expect(player.removeEventListener).toHaveBeenCalledWith(
      "durationchange",
      expect.any(Function),
    );
    await vi.advanceTimersByTimeAsync(1000);
    expect(onPotentialChange).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
