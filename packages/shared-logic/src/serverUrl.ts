function getServerUrl(): string {
  // For Next.js client bundles, env vars are replaced at build-time.
  const fromEnv = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL as
    | string
    | undefined;
  if (typeof fromEnv === "string") {
    const trimmed = fromEnv.trim();

    // Allow setting an explicit empty value to mean "same origin".
    if (!trimmed) {
      if (typeof window !== "undefined") return window.location.origin;
      return "";
    }

    // If an explicit URL is provided, respect it.
    // (Same-origin behavior is achieved by setting this to an empty string.)
    return trimmed;
  }

  // If the web app is opened from a phone/tablet, "localhost" points to that
  // device, not the dev machine. Default to the current hostname instead.
  if (typeof window !== "undefined") {
    const { protocol, hostname, origin } = window.location;
    const safeProtocol = protocol || "http:";
    const safeHostname = hostname || "localhost";

    // Local dev convention: web on :3000, server on :4000.
    const isLocalHost =
      safeHostname === "localhost" ||
      safeHostname === "127.0.0.1" ||
      safeHostname === "0.0.0.0";

    if (isLocalHost) return `${safeProtocol}//${safeHostname}:4000`;

    // Production convention: connect to the same origin so the HttpOnly
    // session cookie is automatically included in the Socket.IO handshake.
    return origin;
  }

  return "http://localhost:4000";
}

export const SERVER_URL = getServerUrl();
