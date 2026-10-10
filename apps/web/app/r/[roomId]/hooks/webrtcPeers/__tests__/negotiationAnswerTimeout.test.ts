import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OFFER_ANSWER_TIMEOUT_MS, PeerNegotiator } from "../negotiation";

class FakePeerConnection {
  signalingState: RTCSignalingState = "stable";
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  offers = 0;
  rollbacks = 0;

  async createOffer() {
    this.offers += 1;
    return { type: "offer" as const, sdp: `offer-${this.offers}` };
  }

  async createAnswer() {
    return { type: "answer" as const, sdp: "answer" };
  }

  async setLocalDescription(description: RTCSessionDescriptionInit) {
    if (description.type === "rollback") {
      this.rollbacks += 1;
      this.signalingState = "stable";
      return;
    }
    this.localDescription = description;
    this.signalingState =
      description.type === "offer" ? "have-local-offer" : "stable";
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    this.remoteDescription = description;
    this.signalingState =
      description.type === "offer" ? "have-remote-offer" : "stable";
  }
}

function createNegotiator(pc: FakePeerConnection) {
  const sendOffer = vi.fn();
  const negotiator = new PeerNegotiator({
    pc: pc as unknown as RTCPeerConnection,
    isPolite: () => false,
    syncTracks: vi.fn(),
    sendOffer,
    sendAnswer: vi.fn(),
  });
  const generationOf = (call: number) =>
    (sendOffer.mock.calls[call]?.[0] as { generation?: string } | undefined)
      ?.generation;
  return { negotiator, sendOffer, generationOf };
}

describe("PeerNegotiator unanswered offers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rolls back and re-sends an offer that was never answered", async () => {
    // The relay's rate limit dropped descriptions without a word. A connected
    // pair then sat in have-local-offer for good, and every renegotiation
    // after it, a microphone turned on included, queued behind that offer.
    const pc = new FakePeerConnection();
    const { negotiator, sendOffer, generationOf } = createNegotiator(pc);

    await negotiator.requestOffer();
    expect(pc.signalingState).toBe("have-local-offer");

    await vi.advanceTimersByTimeAsync(OFFER_ANSWER_TIMEOUT_MS);

    expect(pc.rollbacks).toBe(1);
    expect(sendOffer).toHaveBeenCalledTimes(2);
    expect(generationOf(1)).not.toBe(generationOf(0));
    expect(pc.signalingState).toBe("have-local-offer");
  });

  it("leaves an offer alone once its answer arrived", async () => {
    const pc = new FakePeerConnection();
    const { negotiator, sendOffer, generationOf } = createNegotiator(pc);

    await negotiator.requestOffer();
    await negotiator.receiveDescription({
      type: "answer",
      sdp: "answer",
      generation: generationOf(0),
    });
    await vi.advanceTimersByTimeAsync(OFFER_ANSWER_TIMEOUT_MS * 2);

    expect(pc.rollbacks).toBe(0);
    expect(sendOffer).toHaveBeenCalledTimes(1);
  });

  it("refuses a late answer to the offer it replaced", async () => {
    const pc = new FakePeerConnection();
    const { negotiator, generationOf } = createNegotiator(pc);

    await negotiator.requestOffer();
    const abandoned = generationOf(0);
    await vi.advanceTimersByTimeAsync(OFFER_ANSWER_TIMEOUT_MS);

    await expect(
      negotiator.receiveDescription({
        type: "answer",
        sdp: "late-answer",
        generation: abandoned,
      }),
    ).resolves.toBe(false);
    expect(pc.signalingState).toBe("have-local-offer");
  });

  it("stops waiting once the connection is discarded", async () => {
    const pc = new FakePeerConnection();
    const { negotiator, sendOffer } = createNegotiator(pc);

    await negotiator.requestOffer();
    negotiator.dispose();
    await vi.advanceTimersByTimeAsync(OFFER_ANSWER_TIMEOUT_MS * 2);

    expect(pc.rollbacks).toBe(0);
    expect(sendOffer).toHaveBeenCalledTimes(1);
  });
});
