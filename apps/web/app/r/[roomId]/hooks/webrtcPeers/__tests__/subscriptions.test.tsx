import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  WebRTCIcePayload,
  WebRTCOfferPayload,
  WebRTCPeersLatestRef,
} from "../types";
import { useWebRTCPeerSubscriptions } from "../useWebRTCPeerSubscriptions";

type OfferListener = (data: WebRTCOfferPayload) => void | Promise<void>;
type IceListener = (data: WebRTCIcePayload) => void | Promise<void>;

function createHarness(options: { holdIceGate?: boolean } = {}) {
  let offerListener: OfferListener | undefined;
  let answerListener: OfferListener | undefined;
  let iceListener: IceListener | undefined;

  const addIceCandidate = vi.fn().mockResolvedValue(undefined);
  const peer = {
    remoteDescription: null,
    addIceCandidate,
  } as unknown as RTCPeerConnection;
  const receiveDescription = vi.fn().mockResolvedValue(true);
  const negotiator = { receiveDescription };
  const createPeerConnection = vi.fn(() => peer);
  const getExistingPeer = vi.fn(
    () => undefined as RTCPeerConnection | undefined,
  );
  const getExistingNegotiator = vi.fn(() => undefined);

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
      closePeer: vi.fn(),
      syncTracksToPeer: vi.fn(),
      sendWebRTCAnswer: vi.fn(),
      setRemoteMedia: vi.fn(),
      setRemoteSpeaking: vi.fn(),
      onRoomUsers: undefined,
      onUserJoined: undefined,
      onUserLeft: undefined,
      onWebRTCOffer: (listener: OfferListener) => {
        offerListener = listener;
      },
      onWebRTCAnswer: (listener: OfferListener) => {
        answerListener = listener;
      },
      onWebRTCIce: (listener: IceListener) => {
        iceListener = listener;
      },
      onWebRTCMediaState: undefined,
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
    openIceGate: () => openIceGate(),
  };
}

describe("useWebRTCPeerSubscriptions signaling races", () => {
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
    expect(harness.addIceCandidate).toHaveBeenCalledWith(candidate);
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
});

describe("useWebRTCPeerSubscriptions ICE server gate", () => {
  it("creates the first peer only after the ICE lookup settles, keeping its candidates", async () => {
    const harness = createHarness({ holdIceGate: true });
    const offer = harness.getOfferListener();
    const ice = harness.getIceListener();
    expect(offer).toBeDefined();
    expect(ice).toBeDefined();

    const offerHandled = act(async () => {
      await offer?.({
        roomId: "room",
        from: "peer",
        sdp: { type: "offer", sdp: "v=0" },
      });
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

    harness.openIceGate();
    await offerHandled;

    expect(harness.createPeerConnection).toHaveBeenCalledWith("peer");
    expect(harness.negotiator.receiveDescription).toHaveBeenCalledTimes(1);
    // The buffered candidate is flushed once the description is applied.
    expect(harness.addIceCandidate).toHaveBeenCalledWith({ candidate: "c" });
  });
});
