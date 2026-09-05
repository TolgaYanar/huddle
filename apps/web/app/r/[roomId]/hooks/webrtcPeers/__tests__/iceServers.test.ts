import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_ICE_SERVERS,
  ICE_REFRESH_FRACTION,
  fetchIceConfig,
  hasTurnServer,
  iceServerConfigurationsMatch,
  parseIceConfig,
  parseIceServers,
  refreshDelayMs,
} from "../iceServers";

const TURN = {
  urls: ["turn:relay.example.com:3478?transport=udp"],
  username: "1700000600:abc",
  credential: "c",
};

describe("parseIceServers", () => {
  it("falls back to STUN when nothing is configured", () => {
    expect(parseIceServers(undefined)).toBe(DEFAULT_ICE_SERVERS);
    expect(parseIceServers("")).toBe(DEFAULT_ICE_SERVERS);
    expect(parseIceServers("   ")).toBe(DEFAULT_ICE_SERVERS);
  });

  it("falls back rather than shipping an empty or malformed server list", () => {
    // Any of these reaching RTCPeerConnection would break even the easy calls.
    expect(parseIceServers("not json")).toBe(DEFAULT_ICE_SERVERS);
    expect(parseIceServers("[]")).toBe(DEFAULT_ICE_SERVERS);
    expect(parseIceServers('{"urls":"stun:x"}')).toBe(DEFAULT_ICE_SERVERS);
    expect(parseIceServers('[{"urls":[]}]')).toBe(DEFAULT_ICE_SERVERS);
    expect(parseIceServers('[{"urls":"turn:x","username":5}]')).toBe(
      DEFAULT_ICE_SERVERS,
    );
  });

  it("accepts a TURN relay with credentials alongside STUN", () => {
    const configured = parseIceServers(
      JSON.stringify([{ urls: ["stun:stun.l.google.com:19302"] }, TURN]),
    );
    expect(configured).toHaveLength(2);
    expect(configured[1]).toMatchObject({ username: TURN.username });
  });
});

describe("hasTurnServer", () => {
  it("recognises TURN and TURNS URLs in either supported shape", () => {
    expect(hasTurnServer([{ urls: "turn:relay.example.com" }])).toBe(true);
    expect(
      hasTurnServer([
        { urls: ["stun:stun.example.com", "turns:relay.example.com"] },
      ]),
    ).toBe(true);
    expect(hasTurnServer([{ urls: ["stun:stun.example.com"] }])).toBe(false);
  });
});

describe("iceServerConfigurationsMatch", () => {
  it("detects a rotated TURN credential even when the relay URL is unchanged", () => {
    expect(iceServerConfigurationsMatch([TURN], [{ ...TURN }])).toBe(true);
    expect(
      iceServerConfigurationsMatch(
        [TURN],
        [{ ...TURN, username: "1700001200:def", credential: "rotated" }],
      ),
    ).toBe(false);
  });
});

describe("parseIceConfig", () => {
  it("accepts the server body with or without an expiry", () => {
    expect(parseIceConfig({ iceServers: [TURN], ttlSeconds: 3600 })).toEqual({
      iceServers: [TURN],
      ttlSeconds: 3600,
    });
    expect(parseIceConfig({ iceServers: [TURN], ttlSeconds: null })).toEqual({
      iceServers: [TURN],
      ttlSeconds: null,
    });
    expect(parseIceConfig({ iceServers: [TURN] })?.ttlSeconds).toBeNull();
  });

  it("rejects bodies that would leave the room without usable servers", () => {
    expect(parseIceConfig(null)).toBeNull();
    expect(parseIceConfig("[]")).toBeNull();
    expect(parseIceConfig({ iceServers: [] })).toBeNull();
    expect(parseIceConfig({ iceServers: [{ urls: 3 }] })).toBeNull();
    expect(parseIceConfig({ iceServers: [TURN], ttlSeconds: "1h" })).toBeNull();
    expect(parseIceConfig({ iceServers: [TURN], ttlSeconds: 0 })).toBeNull();
    expect(parseIceConfig({ iceServers: [TURN], ttlSeconds: -5 })).toBeNull();
  });
});

describe("refreshDelayMs", () => {
  it("refreshes well before expiry but never in a tight loop", () => {
    expect(refreshDelayMs(3600)).toBe(3600 * 1000 * ICE_REFRESH_FRACTION);
    expect(refreshDelayMs(1)).toBe(30 * 1000);
  });
});

describe("fetchIceConfig", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const response = (status: number, body: unknown) =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }) as unknown as Response;

  it("returns the server-issued servers", async () => {
    const fetchImpl = vi.fn(async () =>
      response(200, { iceServers: [TURN], ttlSeconds: 600 }),
    );
    await expect(fetchIceConfig({ fetchImpl })).resolves.toEqual({
      iceServers: [TURN],
      ttlSeconds: 600,
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toMatch(/\/api\/webrtc\/ice$/);
    // A cached credential would outlive its expiry.
    expect(init.cache).toBe("no-store");
  });

  it("proves live room membership when requesting TURN credentials", async () => {
    const fetchImpl = vi.fn(async () =>
      response(200, { iceServers: [TURN], ttlSeconds: 600 }),
    );
    await fetchIceConfig({
      fetchImpl,
      iceAccess: {
        roomId: "movie night/one",
        socketId: "socket:1",
        token: "private-capability",
      },
    });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain("roomId=movie+night%2Fone");
    expect(url).toContain("socketId=socket%3A1");
    expect(init.headers).toEqual({
      "X-Huddle-Room-Token": "private-capability",
    });
  });

  it("returns null on a non-2xx, a malformed body, or a thrown fetch", async () => {
    await expect(
      fetchIceConfig({ fetchImpl: vi.fn(async () => response(429, {})) }),
    ).resolves.toBeNull();
    await expect(
      fetchIceConfig({
        fetchImpl: vi.fn(async () => response(200, { iceServers: [] })),
      }),
    ).resolves.toBeNull();
    await expect(
      fetchIceConfig({
        fetchImpl: vi.fn(async () => {
          throw new TypeError("Failed to fetch");
        }),
      }),
    ).resolves.toBeNull();
  });

  it("gives up after the timeout instead of holding the first peer forever", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const pending = fetchIceConfig({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 50,
    });
    await vi.advanceTimersByTimeAsync(60);
    await expect(pending).resolves.toBeNull();
  });
});
