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

function createHarness() {
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

  const latestRef = {
    current: {
      roomId: "room",
      userId: "self",
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
