import { netflixAdapter } from "./netflix";
import type { PlatformAdapter } from "./types";

// This resolver becomes permission-aware when Prime ships. For now the
// content script is injected only on Netflix, so returning the sole measured
// production adapter keeps every existing call deterministic.
export function getActivePlatformAdapter(): PlatformAdapter {
  return netflixAdapter;
}

export type {
  PlatformAdapter,
  PlatformCommandResult,
  PlatformId,
  PlatformMetadata,
} from "./types";
