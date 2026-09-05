import { describe, expect, it } from "vitest";

import { DEFAULT_ICE_SERVERS, parseIceServers } from "../iceServers";

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
      JSON.stringify([
        { urls: ["stun:stun.l.google.com:19302"] },
        {
          urls: ["turn:relay.example.com:3478?transport=udp"],
          username: "u",
          credential: "p",
        },
      ]),
    );
    expect(configured).toHaveLength(2);
    expect(configured[1]).toMatchObject({ username: "u", credential: "p" });
  });
});
