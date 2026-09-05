import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ICE_RETRY_MS, refreshDelayMs } from "../iceServers";
import type { RoomUsersPayload, WebRTCOfferPayload } from "../types";
import {
  PEER_CONNECTION_TIMEOUT_MS,
  PEER_DISCONNECTED_GRACE_MS,
  PEER_RECOVERY_DELAYS_MS,
  useWebRTCPeers,
} from "../useWebRTCPeers";

type RoomUsersListener = (
  data: RoomUsersPayload<unknown>,
) => void | Promise<void>;
type PresenceListener = (peer: string) => void | Promise<void>;
type OfferListener = (data: WebRTCOfferPayload) => void | Promise<void>;

class FakePeerConnection {
  static configs: RTCConfiguration[] = [];
  static instances: FakePeerConnection[] = [];

  signalingState: RTCSignalingState = "stable";
  connectionState: RTCPeerConnectionState = "new";
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  onicecandidate:
    | ((event: { candidate: RTCIceCandidate | null }) => void)
    | null = null;
  ontrack: ((event: RTCTrackEvent) => void) | null = null;
  onsignalingstatechange: (() => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  close = vi.fn(() => {
    this.connectionState = "closed";
  });
  setConfiguration = vi.fn((config: RTCConfiguration) => {
    this.config = config;
  });
  restartIce = vi.fn();
  createOffer = vi.fn(async () => ({
    type: "offer" as const,
    sdp: "offer",
  }));
  createAnswer = vi.fn(async () => ({
    type: "answer" as const,
    sdp: "answer",
  }));
  setLocalDescription = vi.fn(
    async (description: RTCSessionDescriptionInit) => {
      this.localDescription = description;
      this.signalingState =
        description.type === "offer" ? "have-local-offer" : "stable";
    },
  );
  setRemoteDescription = vi.fn(
    async (description: RTCSessionDescriptionInit) => {
      this.remoteDescription = description;
      this.signalingState =
        description.type === "offer" ? "have-remote-offer" : "stable";
    },
  );

  constructor(public config: RTCConfiguration) {
    FakePeerConnection.configs.push(config);
    FakePeerConnection.instances.push(this);
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
}

const TURN = {
  urls: ["turn:relay.example.com:3478?transport=udp"],
  username: "1700000600:abc",
  credential: "c",
};

const iceResponse = (
  iceServers: RTCIceServer[],
  ttlSeconds: number | null = null,
) =>
  ({
    ok: true,
    status: 200,
    json: async () => ({ iceServers, ttlSeconds }),
  }) as unknown as Response;

type RenderPeersProps = { iceAccessToken: string | null };

function renderPeers(initialIceAccessToken: string | null = null) {
  let roomUsers: RoomUsersListener | undefined;
  let userJoined: PresenceListener | undefined;
  let userLeft: PresenceListener | undefined;
  let offer: OfferListener | undefined;
  const peersRef = {
    current: new Map<string, RTCPeerConnection>(),
  };
  const remoteStreamsRef = { current: new Map<string, MediaStream>() };
  const sendWebRTCOffer = vi.fn();

  const hook = renderHook(
    ({ iceAccessToken }: RenderPeersProps) =>
      useWebRTCPeers<unknown>({
        isConnected: true,
        userId: "zzz-self",
        roomId: "room",
        iceAccessToken,
        ensureLocalStream: () => null,
        peersRef,
        remoteStreamsRef,
        setRemoteStreams: vi.fn(),
        setRemoteMedia: vi.fn(),
        setRemoteSpeaking: vi.fn(),
        sendWebRTCIce: vi.fn(),
        sendWebRTCOffer,
        sendWebRTCAnswer: vi.fn(),
        onRoomUsers: (handler) => {
          roomUsers = handler;
        },
        onUserJoined: (handler) => {
          userJoined = handler as PresenceListener;
        },
        onUserLeft: (handler) => {
          userLeft = handler as PresenceListener;
        },
        onWebRTCOffer: (handler) => {
          offer = handler;
        },
        onWebRTCAnswer: undefined,
        onWebRTCIce: undefined,
        onWebRTCMediaState: undefined,
        onWebRTCSpeaking: undefined,
      }),
    { initialProps: { iceAccessToken: initialIceAccessToken } },
  );

  return {
    ...hook,
    peersRef,
    sendWebRTCOffer,
    getRoomUsers: () => roomUsers,
    getUserJoined: () => userJoined,
    getUserLeft: () => userLeft,
    getOffer: () => offer,
  };
}

async function announcePeer(
  harness: ReturnType<typeof renderPeers>,
  peerId = "aaa-peer",
) {
  await act(async () => {
    await harness.getRoomUsers()?.({
      roomId: "room",
      users: ["zzz-self", peerId],
    });
  });
  return FakePeerConnection.instances.at(-1)!;
}

async function setConnectionState(
  pc: FakePeerConnection,
  state: RTCPeerConnectionState,
  advanceMs = 0,
) {
  await act(async () => {
    pc.connectionState = state;
    pc.onconnectionstatechange?.();
    await vi.advanceTimersByTimeAsync(advanceMs);
  });
}

describe("useWebRTCPeers ICE servers", () => {
  beforeEach(() => {
    FakePeerConnection.configs = [];
    FakePeerConnection.instances = [];
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
  });

  afterEach(() => {
    vi.useRealTimers();
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

    const harness = renderPeers();
    expect(harness.getRoomUsers()).toBeDefined();

    // Presence arrives before the lookup settles — the common case, since the
    // socket handshake and the fetch start together.
    const handled = harness.getRoomUsers()?.({
      roomId: "room",
      users: ["zzz-self", "aaa-peer"],
    });
    await Promise.resolve();
    expect(FakePeerConnection.configs).toHaveLength(0);

    await act(async () => {
      resolveFetch(iceResponse([TURN], 600));
      await handled;
    });

    await waitFor(() => expect(FakePeerConnection.configs).toHaveLength(1));
    expect(FakePeerConnection.configs[0]?.iceServers).toEqual([TURN]);
    harness.unmount();
  });

  it("does not resurrect a peer that leaves while the first ICE lookup is pending", async () => {
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

    const harness = renderPeers();
    const pendingSnapshot = harness.getRoomUsers()?.({
      roomId: "room",
      users: ["zzz-self", "aaa-peer"],
    });
    await Promise.resolve();
    await act(async () => {
      await harness.getUserLeft()?.("aaa-peer");
    });

    await act(async () => {
      resolveFetch(iceResponse([TURN], 600));
      await pendingSnapshot;
    });

    expect(FakePeerConnection.instances).toHaveLength(0);
    expect(harness.peersRef.current.has("aaa-peer")).toBe(false);
    harness.unmount();
  });

  it("still creates peers on STUN when the lookup fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    const harness = renderPeers();
    await announcePeer(harness);

    expect(FakePeerConnection.configs).toHaveLength(1);
    const urls = FakePeerConnection.configs[0]?.iceServers?.[0]?.urls;
    expect(urls).toEqual(["stun:stun.l.google.com:19302"]);
    harness.unmount();
  });

  it("upgrades existing peers when the private room token arrives after presence", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 403 } as Response)
      .mockResolvedValueOnce(iceResponse([TURN], 600));
    vi.stubGlobal("fetch", fetchMock);

    const harness = renderPeers();
    const peer = await announcePeer(harness);
    await act(async () => {
      peer.connectionState = "connected";
      peer.onconnectionstatechange?.();
    });
    expect(peer.config.iceServers?.[0]?.urls).toEqual([
      "stun:stun.l.google.com:19302",
    ]);

    await act(async () => {
      harness.rerender({ iceAccessToken: "private-membership-token" });
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]?.[0]).toContain(
      "/api/webrtc/ice?roomId=room&socketId=zzz-self",
    );
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        headers: { "X-Huddle-Room-Token": "private-membership-token" },
      }),
    );
    expect(peer.setConfiguration).toHaveBeenCalledWith({ iceServers: [TURN] });
    expect(peer.restartIce).toHaveBeenCalledOnce();
    expect(harness.sendWebRTCOffer).toHaveBeenCalledWith(
      "aaa-peer",
      expect.objectContaining({ type: "offer" }),
    );
    harness.unmount();
  });

  it("upgrades an existing STUN-only peer when a retry later returns TURN", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("temporary outage"))
      .mockResolvedValueOnce(iceResponse([TURN], 600));
    vi.stubGlobal("fetch", fetchMock);

    const harness = renderPeers();
    const peer = await announcePeer(harness);
    await setConnectionState(peer, "connected");
    expect(peer.config.iceServers?.[0]?.urls).toEqual([
      "stun:stun.l.google.com:19302",
    ]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ICE_RETRY_MS);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(peer.setConfiguration).toHaveBeenCalledWith({ iceServers: [TURN] });
    expect(peer.restartIce).toHaveBeenCalledOnce();
    expect(harness.result.current.peerConnectionStates["aaa-peer"]).toBe(
      "connected",
    );
    expect(peer.createOffer).toHaveBeenCalledOnce();
    expect(harness.sendWebRTCOffer).toHaveBeenCalledWith(
      "aaa-peer",
      expect.objectContaining({ type: "offer" }),
    );
    harness.unmount();
  });

  it("rebuilds a connected STUN-only peer if in-place TURN upgrade is unsupported", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("temporary outage"))
      .mockResolvedValueOnce(iceResponse([TURN], 600));
    vi.stubGlobal("fetch", fetchMock);

    const harness = renderPeers();
    const peer = await announcePeer(harness);
    await setConnectionState(peer, "connected");
    peer.setConfiguration.mockImplementationOnce(() => {
      throw new DOMException("unsupported", "NotSupportedError");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ICE_RETRY_MS);
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(peer.close).toHaveBeenCalledOnce();
    expect(FakePeerConnection.instances).toHaveLength(2);
    expect(harness.sendWebRTCOffer).toHaveBeenCalledWith(
      "aaa-peer",
      expect.objectContaining({ type: "offer" }),
    );
    harness.unmount();
  });

  it("ICE-restarts existing peers when expiring TURN credentials rotate", async () => {
    vi.useFakeTimers();
    const rotatedTurn = {
      ...TURN,
      username: "1700001200:def",
      credential: "rotated",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(iceResponse([TURN], 60))
      .mockResolvedValueOnce(iceResponse([rotatedTurn], 60));
    vi.stubGlobal("fetch", fetchMock);

    const harness = renderPeers();
    const peer = await announcePeer(harness);
    await setConnectionState(peer, "connected");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(refreshDelayMs(60));
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(peer.setConfiguration).toHaveBeenCalledWith({
      iceServers: [rotatedTurn],
    });
    expect(peer.restartIce).toHaveBeenCalledOnce();
    expect(harness.result.current.peerConnectionStates["aaa-peer"]).toBe(
      "connected",
    );
    expect(harness.sendWebRTCOffer).toHaveBeenCalledWith(
      "aaa-peer",
      expect.objectContaining({ type: "offer" }),
    );
    harness.unmount();
  });
});

describe("useWebRTCPeers connection recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakePeerConnection.configs = [];
    FakePeerConnection.instances = [];
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => iceResponse([TURN])),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("recreates and renegotiates a failed connection for an active peer", async () => {
    const harness = renderPeers();
    const failedPeer = await announcePeer(harness);

    await setConnectionState(failedPeer, "failed");

    expect(failedPeer.close).toHaveBeenCalledOnce();
    expect(FakePeerConnection.instances).toHaveLength(2);
    expect(harness.sendWebRTCOffer).toHaveBeenCalledWith(
      "aaa-peer",
      expect.objectContaining({ type: "offer" }),
    );
    expect(harness.result.current.peerConnectionStates["aaa-peer"]).toBe(
      "recovering",
    );
    harness.unmount();
  });

  it("recreates a connection whose initial signaling never settles", async () => {
    const harness = renderPeers();
    const strandedPeer = await announcePeer(harness);

    expect(strandedPeer.connectionState).toBe("new");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PEER_CONNECTION_TIMEOUT_MS);
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(strandedPeer.close).toHaveBeenCalledOnce();
    expect(FakePeerConnection.instances).toHaveLength(2);
    expect(harness.result.current.peerConnectionStates["aaa-peer"]).toBe(
      "recovering",
    );
    harness.unmount();
  });

  it("recovers a peer first learned from an early offer", async () => {
    const harness = renderPeers();
    await act(async () => {
      await harness.getOffer()?.({
        roomId: "room",
        from: "aaa-peer",
        sdp: { type: "offer", sdp: "early-offer" },
      });
    });
    const peer = FakePeerConnection.instances[0]!;

    await setConnectionState(peer, "failed");

    expect(FakePeerConnection.instances).toHaveLength(2);
    expect(harness.sendWebRTCOffer).toHaveBeenCalledWith(
      "aaa-peer",
      expect.objectContaining({ type: "offer" }),
    );
    harness.unmount();
  });

  it("gives a transient disconnect time to self-heal before recovering", async () => {
    const harness = renderPeers();
    const disconnectedPeer = await announcePeer(harness);

    await setConnectionState(
      disconnectedPeer,
      "disconnected",
      PEER_DISCONNECTED_GRACE_MS - 1,
    );
    expect(FakePeerConnection.instances).toHaveLength(1);
    expect(harness.result.current.peerConnectionStates["aaa-peer"]).toBe(
      "recovering",
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await vi.runOnlyPendingTimersAsync();
    });
    expect(disconnectedPeer.close).toHaveBeenCalledOnce();
    expect(FakePeerConnection.instances).toHaveLength(2);
    harness.unmount();
  });

  it("cancels the disconnect timer when the same connection self-heals", async () => {
    const harness = renderPeers();
    const peer = await announcePeer(harness);

    await setConnectionState(peer, "disconnected", 1_000);
    await setConnectionState(peer, "connected", PEER_DISCONNECTED_GRACE_MS);

    expect(peer.close).not.toHaveBeenCalled();
    expect(FakePeerConnection.instances).toHaveLength(1);
    expect(harness.result.current.peerConnectionStates["aaa-peer"]).toBe(
      "connected",
    );
    harness.unmount();
  });

  it("recovers when a disconnected peer stalls in connecting", async () => {
    const harness = renderPeers();
    const peer = await announcePeer(harness);

    await setConnectionState(peer, "disconnected", 1_000);
    await setConnectionState(
      peer,
      "connecting",
      PEER_DISCONNECTED_GRACE_MS - 1_000,
    );
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(peer.close).toHaveBeenCalledOnce();
    expect(FakePeerConnection.instances).toHaveLength(2);
    expect(harness.result.current.peerConnectionStates["aaa-peer"]).toBe(
      "recovering",
    );
    harness.unmount();
  });

  it("cancels recovery when presence says the peer left", async () => {
    const harness = renderPeers();
    const disconnectedPeer = await announcePeer(harness);

    await setConnectionState(disconnectedPeer, "disconnected");
    await act(async () => {
      await harness.getUserLeft()?.("aaa-peer");
      await vi.advanceTimersByTimeAsync(PEER_DISCONNECTED_GRACE_MS + 1);
    });

    expect(disconnectedPeer.close).toHaveBeenCalledOnce();
    expect(FakePeerConnection.instances).toHaveLength(1);
    expect(harness.peersRef.current.has("aaa-peer")).toBe(false);
    harness.unmount();
  });

  it("stops after the bounded number of fresh connection attempts", async () => {
    const harness = renderPeers();
    let peer = await announcePeer(harness);

    for (const delay of PEER_RECOVERY_DELAYS_MS) {
      await setConnectionState(peer, "failed", delay);
      peer = FakePeerConnection.instances.at(-1)!;
    }

    // Failing the last replacement reaches the bound and disposes it without
    // scheduling another RTCPeerConnection.
    await setConnectionState(peer, "failed", 60_000);
    expect(FakePeerConnection.instances).toHaveLength(
      1 + PEER_RECOVERY_DELAYS_MS.length,
    );
    expect(harness.peersRef.current.has("aaa-peer")).toBe(false);
    expect(harness.result.current.peerConnectionStates["aaa-peer"]).toBe(
      "failed",
    );

    await act(async () => {
      await harness.result.current.retryFailedPeers();
    });
    expect(FakePeerConnection.instances).toHaveLength(
      2 + PEER_RECOVERY_DELAYS_MS.length,
    );
    expect(harness.peersRef.current.has("aaa-peer")).toBe(true);
    expect(harness.result.current.peerConnectionStates["aaa-peer"]).toBe(
      "recovering",
    );
    harness.unmount();
  });
});
