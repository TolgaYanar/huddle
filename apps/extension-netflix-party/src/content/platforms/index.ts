import { netflixAdapter } from "./netflix";
import { primeAdapter } from "./prime";
import type { PlatformAdapter } from "./types";

// Host permission decides where the content script may run; once injected,
// exact-origin matching chooses the adapter and rejects lookalike domains.
export function getActivePlatformAdapter(url = location.href): PlatformAdapter {
  for (const adapter of [netflixAdapter, primeAdapter]) {
    if (adapter.matchesOrigin(url)) return adapter;
  }
  throw new Error("No Huddle platform adapter matches this page");
}

export type {
  PlatformAdapter,
  PlatformCommandResult,
  PlatformId,
  PlatformMetadata,
} from "./types";
