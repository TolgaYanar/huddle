import { getApiBaseUrl } from "../../../../lib/api";

/*
 * STUN alone only finds a path when at least one side has a cooperative NAT.
 * Behind symmetric NAT — many mobile carriers, most corporate and campus
 * networks — two peers cannot reach each other without a TURN relay. Relay
 * credentials are issued by the server (GET /api/webrtc/ice) so they can be
 * short-lived and rotated without a web deploy; see
 * apps/server/src/webrtc/iceConfig.js. NEXT_PUBLIC_ICE_SERVERS is only the
 * static fallback used until that lookup settles, or when it fails.
 */
export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302"] },
];

export type IceConfig = {
  iceServers: RTCIceServer[];
  // Seconds until the relay credential expires; null when nothing expires.
  ttlSeconds: number | null;
};

// A lookup slower than this delays the first peer connection for no gain;
// STUN-only is better than a call that never starts.
export const ICE_FETCH_TIMEOUT_MS = 3000;
// A failed lookup is retried while the room stays open, so a server restart
// during a session still ends with relay credentials for the next peer.
export const ICE_RETRY_MS = 60 * 1000;
// Refresh before expiry so every new peer gets a credential with runway;
// existing connections keep the one they negotiated with.
export const ICE_REFRESH_FRACTION = 0.8;

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

function isIceServerList(value: unknown): value is RTCIceServer[] {
  return Array.isArray(value) && value.length > 0 && value.every(isIceServer);
}

export function parseIceServers(
  raw: string | undefined | null,
): RTCIceServer[] {
  if (typeof raw !== "string" || raw.trim() === "") return DEFAULT_ICE_SERVERS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isIceServerList(parsed)) return parsed;
  } catch {
    // Fall through: a malformed value must never leave the room with no ICE
    // servers at all, which would break even the easy connections.
  }
  return DEFAULT_ICE_SERVERS;
}

export function parseIceConfig(value: unknown): IceConfig | null {
  if (!value || typeof value !== "object") return null;
  const { iceServers, ttlSeconds } = value as Record<string, unknown>;
  if (!isIceServerList(iceServers)) return null;
  if (ttlSeconds === null || ttlSeconds === undefined) {
    return { iceServers, ttlSeconds: null };
  }
  if (
    typeof ttlSeconds !== "number" ||
    !Number.isFinite(ttlSeconds) ||
    ttlSeconds <= 0
  ) {
    return null;
  }
  return { iceServers, ttlSeconds };
}

export function refreshDelayMs(ttlSeconds: number): number {
  return Math.max(
    30 * 1000,
    Math.floor(ttlSeconds * 1000 * ICE_REFRESH_FRACTION),
  );
}

/**
 * Ask the server for ICE servers. Resolves null on any failure — network,
 * timeout, rate limit, malformed body — so the caller keeps its fallback.
 */
export async function fetchIceConfig(
  options: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  } = {},
): Promise<IceConfig | null> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") return null;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? ICE_FETCH_TIMEOUT_MS,
  );
  try {
    const res = await fetchImpl(`${getApiBaseUrl()}/api/webrtc/ice`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return parseIceConfig(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
