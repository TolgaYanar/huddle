export type AuthUser = {
  id: string;
  username: string;
  createdAt: string;
};

function normalizeBaseUrl(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return raw;

  // Accept ws/wss as input (common when sharing a socket URL) and map to http/https.
  const mapped = raw.replace(/^ws:/i, "http:").replace(/^wss:/i, "https:");

  try {
    const u = new URL(mapped);
    return `${u.protocol}//${u.host}`;
  } catch {
    // Fall back to raw string if it isn't a valid absolute URL.
    return mapped;
  }
}

function getApiBaseUrl(): string {
  // Keep in sync with packages/shared-logic socket URL default.
  const fromEnvApi = process.env.NEXT_PUBLIC_API_BASE_URL as string | undefined;
  if (fromEnvApi) return normalizeBaseUrl(fromEnvApi);

  const fromEnvSocket = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL as
    | string
    | undefined;
  if (fromEnvSocket) return normalizeBaseUrl(fromEnvSocket);

  if (typeof window !== "undefined") {
    const protocol = window.location.protocol || "http:";
    const hostname = window.location.hostname || "localhost";

    const isLocalhost =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0";

    // Dev: backend runs on :4000.
    // Prod (Vercel): prefer same-origin and rely on Next rewrites to proxy /api/*.
    return isLocalhost
      ? `${protocol}//${hostname}:4000`
      : `${protocol}//${hostname}`;
  }

  return "http://localhost:4000";
}

type ApiError = Error & { status?: number; code?: string };

async function requestJson<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {}
): Promise<T> {
  const baseUrl = getApiBaseUrl();

  const controller = new AbortController();
  const timeoutMs = 15000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const headers = new Headers(init.headers);
  let body = init.body;

  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      ...init,
      body,
      headers,
      credentials: "include",
      signal: controller.signal,
    });
  } catch (err) {
    const apiErr: ApiError = new Error(
      err instanceof DOMException && err.name === "AbortError"
        ? "Request timed out. Please try again."
        : "Network error. Please try again."
    );
    apiErr.code =
      err instanceof DOMException && err.name === "AbortError"
        ? "timeout"
        : "network_error";
    throw apiErr;
  } finally {
    clearTimeout(timeoutId);
  }

  const data = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  if (!res.ok) {
    const err: ApiError = new Error(
      (data && typeof data.error === "string" && data.error) ||
        `http_${res.status}`
    );
    err.status = res.status;
    err.code = data && typeof data.error === "string" ? data.error : undefined;
    throw err;
  }

  return data as T;
}

export async function apiAuthMe(): Promise<{ user: AuthUser | null }> {
  return requestJson("/api/auth/me", { method: "GET" });
}

export async function apiRegister(username: string, password: string) {
  return requestJson<{ user: AuthUser }>("/api/auth/register", {
    method: "POST",
    json: { username, password },
  });
}

export async function apiLogin(username: string, password: string) {
  return requestJson<{ user: AuthUser }>("/api/auth/login", {
    method: "POST",
    json: { username, password },
  });
}

export async function apiLogout() {
  return requestJson<{ ok: true }>("/api/auth/logout", { method: "POST" });
}

export async function apiListSavedRooms(): Promise<{
  rooms: Array<{ roomId: string; createdAt: string }>;
}> {
  return requestJson("/api/saved-rooms", { method: "GET" });
}

export async function apiSaveRoom(roomId: string) {
  return requestJson<{ room: { roomId: string; createdAt: string } }>(
    "/api/saved-rooms",
    {
      method: "POST",
      json: { roomId },
    }
  );
}

export async function apiUnsaveRoom(roomId: string) {
  return requestJson<{ ok: true }>(
    `/api/saved-rooms/${encodeURIComponent(roomId)}`,
    {
      method: "DELETE",
    }
  );
}
