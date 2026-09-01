export const PRIME_ORIGIN_PATTERN = "https://www.primevideo.com/*";
export const PRIME_CONTENT_SCRIPT_ID = "huddle-prime-video";

export type SupportedTabPlatform = "netflix" | "prime";

export type SupportedTab = {
  platform: SupportedTabPlatform;
  displayName: string;
  isPlaybackPage: boolean;
};

export function detectSupportedTab(url: string): SupportedTab | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;

  if (parsed.hostname === "www.netflix.com") {
    return {
      platform: "netflix",
      displayName: "Netflix",
      isPlaybackPage: /^\/watch\/\d+/.test(parsed.pathname),
    };
  }
  if (parsed.hostname === "www.primevideo.com") {
    return {
      platform: "prime",
      displayName: "Prime Video",
      isPlaybackPage: /\/detail\/[A-Z0-9]+/i.test(parsed.pathname),
    };
  }
  return null;
}

export async function hasPrimePermission(): Promise<boolean> {
  return chrome.permissions.contains({ origins: [PRIME_ORIGIN_PATTERN] });
}

export async function ensurePrimeContentScriptRegistered(): Promise<void> {
  const existing = await chrome.scripting.getRegisteredContentScripts({
    ids: [PRIME_CONTENT_SCRIPT_ID],
  });
  if (existing.length > 0) return;

  await chrome.scripting.registerContentScripts([
    {
      id: PRIME_CONTENT_SCRIPT_ID,
      matches: [PRIME_ORIGIN_PATTERN],
      js: ["content.js"],
      runAt: "document_idle",
      persistAcrossSessions: true,
    },
  ]);
}

export async function enablePrimeForTab(tabId: number): Promise<boolean> {
  const granted = await chrome.permissions.request({
    origins: [PRIME_ORIGIN_PATTERN],
  });
  if (!granted) return false;

  await activatePrimeForTab(tabId);
  return true;
}

export async function activatePrimeForTab(tabId: number): Promise<void> {
  await ensurePrimeContentScriptRegistered();
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });
}
