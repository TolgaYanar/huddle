/*
 * STUN alone only finds a path when at least one side has a cooperative NAT.
 * Behind symmetric NAT — many mobile carriers, most corporate and campus
 * networks — two peers cannot reach each other without a TURN relay, and the
 * connection sits in "checking" until it fails. That is not fixable in code;
 * it needs a relay to be configured. NEXT_PUBLIC_ICE_SERVERS is a JSON array
 * in the RTCIceServer shape, inlined at build time.
 */
export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302"] },
];

function isIceServer(value: unknown): value is RTCIceServer {
  if (!value || typeof value !== "object") return false;
  const { urls, username, credential } = value as Record<string, unknown>;
  const urlsOk =
    typeof urls === "string" ||
    (Array.isArray(urls) &&
      urls.length > 0 &&
      urls.every((u) => typeof u === "string"));
  if (!urlsOk) return false;
  if (username !== undefined && typeof username !== "string") return false;
  if (credential !== undefined && typeof credential !== "string") return false;
  return true;
}

export function parseIceServers(
  raw: string | undefined | null,
): RTCIceServer[] {
  if (typeof raw !== "string" || raw.trim() === "") return DEFAULT_ICE_SERVERS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every(isIceServer)
    ) {
      return parsed;
    }
  } catch {
    // Fall through: a malformed value must never leave the room with no ICE
    // servers at all, which would break even the easy connections.
  }
  return DEFAULT_ICE_SERVERS;
}
