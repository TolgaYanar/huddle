import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  detectSupportedTab,
  enablePrimeForTab,
  ensurePrimeContentScriptRegistered,
  PRIME_CONTENT_SCRIPT_ID,
  PRIME_ORIGIN_PATTERN,
} from "../platformPermissions";

const chromeMocks = {
  contains: vi.fn(),
  request: vi.fn(),
  getRegisteredContentScripts: vi.fn(),
  registerContentScripts: vi.fn(),
  executeScript: vi.fn(),
};

describe("optional Prime permission", () => {
  beforeEach(() => {
    vi.stubGlobal("chrome", {
      permissions: {
        contains: chromeMocks.contains,
        request: chromeMocks.request,
      },
      scripting: {
        getRegisteredContentScripts: chromeMocks.getRegisteredContentScripts,
        registerContentScripts: chromeMocks.registerContentScripts,
        executeScript: chromeMocks.executeScript,
      },
    });
    chromeMocks.getRegisteredContentScripts.mockResolvedValue([]);
    chromeMocks.registerContentScripts.mockResolvedValue(undefined);
    chromeMocks.executeScript.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("recognises only exact supported origins and playback paths", () => {
    expect(
      detectSupportedTab("https://www.primevideo.com/region/eu/detail/ABC123"),
    ).toMatchObject({ platform: "prime", isPlaybackPage: true });
    expect(
      detectSupportedTab("https://www.netflix.com/watch/81234"),
    ).toMatchObject({ platform: "netflix", isPlaybackPage: true });
    expect(
      detectSupportedTab("https://www.primevideo.com/storefront/home"),
    ).toMatchObject({ platform: "prime", isPlaybackPage: false });

    for (const spoof of [
      "https://primevideo.com.evil.test/detail/ABC",
      "https://notnetflix.com/watch/1",
      "http://www.primevideo.com/detail/ABC",
    ]) {
      expect(detectSupportedTab(spoof)).toBeNull();
    }
  });

  it("does nothing when the persisted content script already exists", async () => {
    chromeMocks.getRegisteredContentScripts.mockResolvedValue([
      { id: PRIME_CONTENT_SCRIPT_ID },
    ]);
    await ensurePrimeContentScriptRegistered();
    expect(chromeMocks.registerContentScripts).not.toHaveBeenCalled();
  });

  it("registers a persistent script for the optional origin", async () => {
    await ensurePrimeContentScriptRegistered();
    expect(chromeMocks.registerContentScripts).toHaveBeenCalledWith([
      expect.objectContaining({
        id: PRIME_CONTENT_SCRIPT_ID,
        matches: [PRIME_ORIGIN_PATTERN],
        js: ["content.js"],
        persistAcrossSessions: true,
      }),
    ]);
  });

  it("never registers or injects when the user denies permission", async () => {
    chromeMocks.request.mockResolvedValue(false);
    await expect(enablePrimeForTab(42)).resolves.toBe(false);
    expect(chromeMocks.registerContentScripts).not.toHaveBeenCalled();
    expect(chromeMocks.executeScript).not.toHaveBeenCalled();
  });

  it("registers and injects only after an explicit grant", async () => {
    chromeMocks.request.mockResolvedValue(true);
    await expect(enablePrimeForTab(42)).resolves.toBe(true);
    expect(chromeMocks.request).toHaveBeenCalledWith({
      origins: [PRIME_ORIGIN_PATTERN],
    });
    expect(chromeMocks.executeScript).toHaveBeenCalledWith({
      target: { tabId: 42 },
      files: ["content.js"],
    });
  });
});
