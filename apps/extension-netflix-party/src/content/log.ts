import { DEBUG_LOGS } from "./constants";

export function debugLog(...args: unknown[]) {
  if (!DEBUG_LOGS) return;
  console.log("[HuddleNetflix]", ...args);
}
