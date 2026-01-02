export type AuthUser = {
  id: string;
  username: string;
  createdAt: string;
};

function getApiBaseUrl(): string {
  // Keep in sync with packages/shared-logic socket URL default.
  const fromEnv = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL as
    | string
    | undefined;
  if (fromEnv) return fromEnv;

  if (typeof window !== "undefined") {
    const protocol = window.location.protocol || "http:";
    const hostname = window.location.hostname || "localhost";
    return `${protocol}//${hostname}:4000`;
  }

  return "http://localhost:4000";
}

type ApiError = Error & { status?: number; code?: string };

async function requestJson<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {}
): Promise<T> {
  const baseUrl = getApiBaseUrl();

  const headers = new Headers(init.headers);
  let body = init.body;

  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }

  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    body,
    headers,
    credentials: "include",
  });

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
