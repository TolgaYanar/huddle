import { DEBUG_LOGS } from "./constants";

export function debugLog(...args: any[]) {
  if (!DEBUG_LOGS) return;
  // eslint-disable-next-line no-console
  console.log("[HuddleNetflix]", ...args);
}
