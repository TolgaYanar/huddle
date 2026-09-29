import { afterEach, describe, expect, it, vi } from "vitest";

// SERVER_URL is computed once at import time, so each case re-imports.
async function resolve({
  env,
  location,
}: {
  env?: string;
  location?: { protocol: string; hostname: string; origin: string };
}) {
  vi.resetModules();
  if (env === undefined) vi.stubEnv("NEXT_PUBLIC_SOCKET_SERVER_URL", undefined);
  else vi.stubEnv("NEXT_PUBLIC_SOCKET_SERVER_URL", env);
  if (location) vi.stubGlobal("window", { location });
  const mod = await import("../serverUrl");
  return mod.SERVER_URL;
}

const prod = {
  protocol: "https:",
  hostname: "wehuddle.tv",
  origin: "https://wehuddle.tv",
};

describe("SERVER_URL", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  // Same origin is what lets the HttpOnly session cookie ride the Socket.IO
  // handshake; any other default connects the socket unauthenticated.
  it("uses the page origin in production", async () => {
    expect(await resolve({ location: prod })).toBe("https://wehuddle.tv");
  });

  it("treats an explicit empty value as same origin", async () => {
    expect(await resolve({ env: "  ", location: prod })).toBe(
      "https://wehuddle.tv",
    );
  });

  it("respects an explicit URL", async () => {
    expect(
      await resolve({ env: " https://api.example.com ", location: prod }),
    ).toBe("https://api.example.com");
  });

  it("points local dev at :4000 on the same host", async () => {
    expect(
      await resolve({
        location: {
          protocol: "http:",
          hostname: "localhost",
          origin: "http://localhost:3002",
        },
      }),
    ).toBe("http://localhost:4000");
  });

  it("falls back to localhost:4000 with no window", async () => {
    expect(await resolve({})).toBe("http://localhost:4000");
  });
});
