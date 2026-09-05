import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RoomUsersPayload } from "../types";
import { useWebRTCPeers } from "../useWebRTCPeers";

class FakePeerConnection {
  static configs: RTCConfiguration[] = [];
  signalingState = "stable";
  connectionState = "new";
  onicecandidate: unknown = null;
  ontrack: unknown = null;
  onsignalingstatechange: unknown = null;
  onconnectionstatechange: unknown = null;
  constructor(config: RTCConfiguration) {
    FakePeerConnection.configs.push(config);
  }
  getSenders() {
    return [];
  }
  getTransceivers() {
    return [];
  }
  addTrack() {
    return {};
  }
  close() {}
}

const TURN = {
  urls: ["turn:relay.example.com:3478?transport=udp"],
  username: "1700000600:abc",
  credential: "c",
};

function renderPeers(
  onRoomUsers: (
    handler: (data: RoomUsersPayload<unknown>) => void | Promise<void>,
  ) => void,
) {
  return renderHook(() =>
    useWebRTCPeers<unknown>({
      isConnected: true,
      userId: "zzz-self",
      roomId: "room",
      ensureLocalStream: () => null,
      peersRef: { current: new Map() },
      remoteStreamsRef: { current: new Map() },
      setRemoteStreams: vi.fn(),
      setRemoteMedia: vi.fn(),
      setRemoteSpeaking: vi.fn(),
      sendWebRTCIce: vi.fn(),
      sendWebRTCOffer: vi.fn(),
      sendWebRTCAnswer: vi.fn(),
      onRoomUsers,
      onUserJoined: undefined,
      onUserLeft: undefined,
      onWebRTCOffer: undefined,
      onWebRTCAnswer: undefined,
      onWebRTCIce: undefined,
      onWebRTCMediaState: undefined,
      onWebRTCSpeaking: undefined,
    }),
  );
}

describe("useWebRTCPeers ICE servers", () => {
  beforeEach(() => {
    FakePeerConnection.configs = [];
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds the first peer with the servers the server issued, not the static fallback", async () => {
    let resolveFetch: (value: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );

    let roomUsers:
      | ((data: RoomUsersPayload<unknown>) => void | Promise<void>)
      | undefined;
    renderPeers((handler) => {
      roomUsers = handler;
    });
    expect(roomUsers).toBeDefined();

    // Presence arrives before the lookup settles — the common case, since the
    // socket handshake and the fetch start together.
    const handled = act(async () => {
      await roomUsers?.({ roomId: "room", users: ["zzz-self", "aaa-peer"] });
    });
    await Promise.resolve();
    expect(FakePeerConnection.configs).toHaveLength(0);

    resolveFetch({
      ok: true,
      status: 200,
      json: async () => ({ iceServers: [TURN], ttlSeconds: 600 }),
    } as unknown as Response);
    await handled;

    await waitFor(() => expect(FakePeerConnection.configs).toHaveLength(1));
    expect(FakePeerConnection.configs[0]?.iceServers).toEqual([TURN]);
  });

  it("still creates peers on STUN when the lookup fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    let roomUsers:
      | ((data: RoomUsersPayload<unknown>) => void | Promise<void>)
      | undefined;
    renderPeers((handler) => {
      roomUsers = handler;
    });
    await act(async () => {
      await roomUsers?.({ roomId: "room", users: ["zzz-self", "aaa-peer"] });
    });

    await waitFor(() => expect(FakePeerConnection.configs).toHaveLength(1));
    const urls = FakePeerConnection.configs[0]?.iceServers?.[0]?.urls;
    expect(urls).toEqual(["stun:stun.l.google.com:19302"]);
  });
});
