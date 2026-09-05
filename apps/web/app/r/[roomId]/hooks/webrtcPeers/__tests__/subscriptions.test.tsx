import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  WebRTCIcePayload,
  WebRTCMediaStatePayload,
  WebRTCOfferPayload,
  WebRTCPeersLatestRef,
} from "../types";
import { useWebRTCPeerSubscriptions } from "../useWebRTCPeerSubscriptions";

type OfferListener = (data: WebRTCOfferPayload) => void | Promise<void>;
type IceListener = (data: WebRTCIcePayload) => void | Promise<void>;
type MediaListener = (data: WebRTCMediaStatePayload<unknown>) => void;

function createHarness(
  options: {
    holdIceGate?: boolean;
    authoritativePeers?: string[];
    activeGeneration?: string;
  } = {},
) {
  let offerListener: OfferListener | undefined;
  let answerListener: OfferListener | undefined;
  let iceListener: IceListener | undefined;
  let mediaListener: MediaListener | undefined;
  let userJoinedListener: ((peer: string) => void | Promise<void>) | undefined;
  let userLeftListener: ((peer: string) => void) | undefined;

  const addIceCandidate = vi.fn().mockResolvedValue(undefined);
  const peer = {
    remoteDescription: null,
    addIceCandidate,
  } as unknown as RTCPeerConnection;
  let activeGeneration: string | null = options.activeGeneration ?? null;
  const receiveDescription = vi.fn(async (description: unknown) => {
    const generation = (description as { generation?: unknown } | null)
      ?.generation;
    if (typeof generation === "string") activeGeneration = generation;
    return true;
  });
  const negotiator = {
    receiveDescription,
    getActiveGeneration: vi.fn(() => activeGeneration),
    shouldIgnoreIceError: vi.fn(() => false),
  };
  const createPeerConnection = vi.fn(() => peer);
  const getExistingPeer = vi.fn(
    () => undefined as RTCPeerConnection | undefined,
  );
  const getExistingNegotiator = vi.fn(() => negotiator);
  const activePeerIds = new Set<string>();
  const setRemoteMedia = vi.fn();
  const recoverPeer = vi.fn();

  let openIceGate: () => void = () => {};
  const iceReady = new Promise<void>((resolve) => {
    openIceGate = resolve;
  });
  if (!options.holdIceGate) openIceGate();

  const latestRef = {
    current: {
      roomId: "room",
      userId: "self",
      iceReady,
      createPeerConnection,
      getPeerIds: vi.fn(() => []),
      getExistingPeer,
      getExistingNegotiator,
      getPeerNegotiator: vi.fn(() => negotiator),
      sendOfferToPeer: vi.fn().mockResolvedValue(undefined),
      recoverPeer,
      closePeer: vi.fn(),
      syncTracksToPeer: vi.fn(),
      replaceActivePeerIds: (peerIds: Iterable<string>) => {
        activePeerIds.clear();
        for (const peerId of peerIds) activePeerIds.add(peerId);
      },
      markPeerActive: (peerId: string) => activePeerIds.add(peerId),
      markPeerInactive: (peerId: string) => activePeerIds.delete(peerId),
      isPeerActive: (peerId: string) => activePeerIds.has(peerId),
      sendWebRTCAnswer: vi.fn(),
      setRemoteMedia,
      setRemoteSpeaking: vi.fn(),
      onRoomUsers:
        options.authoritativePeers === undefined
          ? undefined
          : (listener: (data: { roomId: string; users: string[] }) => void) => {
              listener({
                roomId: "room",
                users: ["self", ...options.authoritativePeers!],
              });
            },
      onUserJoined: (listener: (peer: string) => void | Promise<void>) => {
        userJoinedListener = listener;
      },
      onUserLeft: (listener: (peer: string) => void) => {
        userLeftListener = listener;
      },
      onWebRTCOffer: (listener: OfferListener) => {
        offerListener = listener;
      },
      onWebRTCAnswer: (listener: OfferListener) => {
        answerListener = listener;
      },
      onWebRTCIce: (listener: IceListener) => {
        iceListener = listener;
      },
      onWebRTCMediaState: (listener: MediaListener) => {
        mediaListener = listener;
      },
      onWebRTCSpeaking: undefined,
    },
  } as unknown as WebRTCPeersLatestRef<unknown>;

  const hook = renderHook(() =>
    useWebRTCPeerSubscriptions({
      isConnected: true,
      userId: "self",
      roomId: "room",
      latestRef,
    }),
  );

  return {
    ...hook,
    peer,
    negotiator,
    addIceCandidate,
    createPeerConnection,
    getExistingPeer,
    getExistingNegotiator,
    getOfferListener: () => offerListener,
    getAnswerListener: () => answerListener,
    getIceListener: () => iceListener,
    getMediaListener: () => mediaListener,
    getUserJoinedListener: () => userJoinedListener,
    getUserLeftListener: () => userLeftListener,
    setRemoteMedia,
    recoverPeer,
    openIceGate: () => openIceGate(),
  };
}

describe("useWebRTCPeerSubscriptions signaling races", () => {
  it("forces recovery when applying an offer leaves signaling half-finished", async () => {
    const harness = createHarness();
    harness.negotiator.receiveDescription.mockRejectedValueOnce(
      new DOMException("answer failed", "OperationError"),
    );

    await act(async () => {
      await harness.getOfferListener()?.({
        roomId: "room",
        from: "peer",
        sdp: { type: "offer", sdp: "offer" },
      });
    });

    expect(harness.recoverPeer).toHaveBeenCalledWith("peer", harness.peer);
    harness.unmount();
  });

  it("forces recovery when an answer cannot be applied", async () => {
    const harness = createHarness();
    harness.getExistingPeer.mockReturnValue(harness.peer);
    harness.negotiator.receiveDescription.mockRejectedValueOnce(
      new DOMException("answer failed", "OperationError"),
    );

    await act(async () => {
      await harness.getAnswerListener()?.({
        roomId: "room",
        from: "peer",
        sdp: { type: "answer", sdp: "answer" },
      });
    });

    expect(harness.recoverPeer).toHaveBeenCalledWith("peer", harness.peer);
    harness.unmount();
  });

  it("buffers ICE before the offer without creating a peer, then flushes it", async () => {
    const harness = createHarness();
    const candidate = { candidate: "candidate:1" };

    await act(async () => {
      await harness.getIceListener()?.({
        roomId: "room",
        from: "peer",
        candidate,
      });
    });

    expect(harness.createPeerConnection).not.toHaveBeenCalled();
    expect(harness.addIceCandidate).not.toHaveBeenCalled();

    await act(async () => {
      await harness.getOfferListener()?.({
        roomId: "room",
        from: "peer",
        sdp: { type: "offer", sdp: "offer" },
      });
    });

    expect(harness.createPeerConnection).toHaveBeenCalledOnce();
    expect(harness.addIceCandidate).toHaveBeenCalledWith({
      candidate: candidate.candidate,
      sdpMid: null,
      sdpMLineIndex: null,
      usernameFragment: null,
    });
    harness.unmount();
  });

  it("drops an answer for a closed peer instead of recreating it", async () => {
    const harness = createHarness();

    await act(async () => {
      await harness.getAnswerListener()?.({
        roomId: "room",
        from: "departed-peer",
        sdp: { type: "answer", sdp: "late-answer" },
      });
    });

    expect(harness.getExistingPeer).toHaveBeenCalledWith("departed-peer");
    expect(harness.createPeerConnection).not.toHaveBeenCalled();
    expect(harness.negotiator.receiveDescription).not.toHaveBeenCalled();
    harness.unmount();
  });

  it("drops buffered ICE from an older signaling generation", async () => {
    const harness = createHarness();

    await act(async () => {
      await harness.getIceListener()?.({
        roomId: "room",
        from: "peer",
        candidate: { candidate: "old", generation: "old-generation" },
      });
      await harness.getOfferListener()?.({
        roomId: "room",
        from: "peer",
        sdp: {
          type: "offer",
          sdp: "v=0",
          generation: "current-generation",
        },
      });
    });

    expect(harness.addIceCandidate).not.toHaveBeenCalled();
    harness.unmount();
  });
});

describe("useWebRTCPeerSubscriptions ICE server gate", () => {
  it("does not replay an offer for a peer absent from the latest room snapshot", async () => {
    const harness = createHarness({ authoritativePeers: [] });

    await act(async () => {
      await harness.getOfferListener()?.({
        roomId: "room",
        from: "departed-peer",
        sdp: { type: "offer", sdp: "v=0" },
      });
    });

    expect(harness.createPeerConnection).not.toHaveBeenCalled();
    expect(harness.negotiator.receiveDescription).not.toHaveBeenCalled();
  });

  it("drops stale media and ICE replayed for a peer absent from the snapshot", async () => {
    const harness = createHarness({ authoritativePeers: [] });
    harness.setRemoteMedia.mockClear();

    act(() => {
      harness.getMediaListener()?.({
        roomId: "room",
        from: "peer",
        state: { mic: true },
      });
    });
    await act(async () => {
      await harness.getIceListener()?.({
        roomId: "room",
        from: "peer",
        candidate: { candidate: "stale" },
      });
      await harness.getUserJoinedListener()?.("peer");
      await harness.getOfferListener()?.({
        roomId: "room",
        from: "peer",
        sdp: { type: "offer", sdp: "v=0" },
      });
    });

    expect(harness.setRemoteMedia).not.toHaveBeenCalled();
    expect(harness.addIceCandidate).not.toHaveBeenCalled();
  });

  it("creates the first peer only after the ICE lookup settles, keeping its candidates", async () => {
    const harness = createHarness({ holdIceGate: true });
    const offer = harness.getOfferListener();
    const ice = harness.getIceListener();
    expect(offer).toBeDefined();
    expect(ice).toBeDefined();

    const offerHandled = offer?.({
      roomId: "room",
      from: "peer",
      sdp: { type: "offer", sdp: "v=0" },
    });
    await act(async () => {
      await ice?.({
        roomId: "room",
        from: "peer",
        candidate: { candidate: "c" },
      });
    });

    // Neither the offer nor the candidate may touch a connection that does
    // not have its relay credentials yet.
    expect(harness.createPeerConnection).not.toHaveBeenCalled();
    expect(harness.addIceCandidate).not.toHaveBeenCalled();

    await act(async () => {
      harness.openIceGate();
      await offerHandled;
    });

    expect(harness.createPeerConnection).toHaveBeenCalledWith("peer");
    expect(harness.negotiator.receiveDescription).toHaveBeenCalledTimes(1);
    // The buffered candidate is flushed once the description is applied.
    expect(harness.addIceCandidate).toHaveBeenCalledWith({
      candidate: "c",
      sdpMid: null,
      sdpMLineIndex: null,
      usernameFragment: null,
    });
  });

  it("lets user_left cancel an early offer while the ICE gate is pending", async () => {
    const harness = createHarness({ holdIceGate: true });
    const offerHandled = harness.getOfferListener()?.({
      roomId: "room",
      from: "peer",
      sdp: { type: "offer", sdp: "v=0" },
    });
    await Promise.resolve();

    await act(async () => {
      harness.getUserLeftListener()?.("peer");
    });
    await act(async () => {
      harness.openIceGate();
      await offerHandled;
    });

    expect(harness.createPeerConnection).not.toHaveBeenCalled();
    expect(harness.negotiator.receiveDescription).not.toHaveBeenCalled();
  });
});
