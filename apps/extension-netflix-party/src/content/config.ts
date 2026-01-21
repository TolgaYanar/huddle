import { FIXED_SERVER_URL, STORAGE_KEYS } from "./constants";
import type { ExtensionConfig } from "./types";

export async function loadConfig(): Promise<ExtensionConfig> {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.roomId]);
  return {
    serverUrl: FIXED_SERVER_URL,
    roomId: (stored?.[STORAGE_KEYS.roomId] as string) || "",
  };
}

export function normalizeServerUrl(serverUrl: string): string {
  return serverUrl.replace(/\/+$/, "");
}
