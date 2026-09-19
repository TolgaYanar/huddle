import { describe, it, expect } from "vitest";

import {
  detectPlatform,
  isTier3Platform,
  PLATFORM_CAPABILITIES,
} from "../platform";

/**
 * Regression cover for the "install the extension" DRM flow.
 *
 * Netflix used to be marked playable (`canPlay: true`) so the web app could
 * drive a manual-sync popup. That popup left a generic 20s load-timeout armed,
 * which fired a bogus "Player error" (with the raw tracking URL) stacked on top
 * of the sync overlay. Netflix and Prime — the two platforms the Huddle
 * extension actually supports — now route to the CTA card and must stay
 * non-playable so the control bar, timeline, and load-timeout all stay off.
 */
describe("DRM platforms route to the extension CTA, not the web player", () => {
  it("detects the extension-supported DRM platforms from their URLs", () => {
    expect(detectPlatform("https://www.netflix.com/watch/70305896")).toBe(
      "netflix",
    );
    expect(detectPlatform("https://www.primevideo.com/detail/0ABCDEF")).toBe(
      "prime",
    );
  });

  it("marks every DRM platform as Tier-3 (cannot embed inline)", () => {
    for (const p of [
      "netflix",
      "prime",
      "disney_plus",
      "hbo",
      "hulu",
      "apple_tv_plus",
      "paramount_plus",
      "peacock",
    ] as const) {
      expect(isTier3Platform(p)).toBe(true);
    }
  });

  it("gives DRM platforms no playback capabilities so the control bar stays disabled", () => {
    for (const p of ["netflix", "prime", "disney_plus"] as const) {
      const caps = PLATFORM_CAPABILITIES[p];
      expect(caps.canPlay).toBe(false);
      expect(caps.canPause).toBe(false);
      expect(caps.canSeek).toBe(false);
      // canGetDuration + canSeek gate the timeline; both off means no scrubber.
      expect(caps.canGetDuration).toBe(false);
      expect(caps.speedOptions).toHaveLength(0);
    }
  });
});
