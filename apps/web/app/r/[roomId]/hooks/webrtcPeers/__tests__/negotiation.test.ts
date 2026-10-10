import { describe, expect, it, vi } from "vitest";

import { PeerNegotiator } from "../negotiation";

class FakePeerConnection {
  signalingState: RTCSignalingState = "stable";
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  offers = 0;
  answers = 0;
  offerGate: Promise<void> | null = null;

  async createOffer() {
    await this.offerGate;
    this.offers += 1;
    return { type: "offer" as const, sdp: `offer-${this.offers}` };
  }

  async createAnswer() {
    this.answers += 1;
    return { type: "answer" as const, sdp: `answer-${this.answers}` };
  }

  async setLocalDescription(description: RTCSessionDescriptionInit) {
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

function createNegotiator(pc: FakePeerConnection, polite: boolean) {
  const sendOffer = vi.fn();
  const sendAnswer = vi.fn();
  const syncTracks = vi.fn();
  const negotiator = new PeerNegotiator({
    pc: pc as unknown as RTCPeerConnection,
    isPolite: () => polite,
    syncTracks,
    sendOffer,
    sendAnswer,
  });
  return { negotiator, sendOffer, sendAnswer, syncTracks };
}

describe("PeerNegotiator", () => {
  it("waits for asynchronous track replacement before creating an offer", async () => {
    const pc = new FakePeerConnection();
    let releaseSync = () => {};
    const syncTracks = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseSync = resolve;
        }),
    );
    const sendOffer = vi.fn();
    const negotiator = new PeerNegotiator({
      pc: pc as unknown as RTCPeerConnection,
      isPolite: () => false,
      syncTracks,
      sendOffer,
      sendAnswer: vi.fn(),
    });

    const pending = negotiator.requestOffer();
    await Promise.resolve();
    expect(pc.offers).toBe(0);

    releaseSync();
    await expect(pending).resolves.toBe("sent");
    expect(pc.offers).toBe(1);
    expect(sendOffer).toHaveBeenCalledOnce();
  });

  it("queues renegotiation while unstable and sends it after the answer", async () => {
    const pc = new FakePeerConnection();
    pc.signalingState = "have-local-offer";
    const { negotiator, sendOffer } = createNegotiator(pc, false);

    await expect(negotiator.requestOffer()).resolves.toBe("queued");
    expect(sendOffer).not.toHaveBeenCalled();

    await expect(
      negotiator.receiveDescription({ type: "answer", sdp: "remote-answer" }),
    ).resolves.toBe(true);
    expect(sendOffer).toHaveBeenCalledTimes(1);
    expect(pc.signalingState).toBe("have-local-offer");
  });

  it("lets the polite peer accept and answer a colliding offer", async () => {
    const pc = new FakePeerConnection();
    pc.signalingState = "have-local-offer";
    const { negotiator, sendAnswer, sendOffer } = createNegotiator(pc, true);

    await expect(
      negotiator.receiveDescription({ type: "offer", sdp: "remote-offer" }),
    ).resolves.toBe(true);
    expect(sendAnswer).toHaveBeenCalledTimes(1);
    // Accepting the collision rolls back the offer this peer had outstanding,
    // so it re-offers immediately; the exchange ends mid-flight by design
    // rather than back at stable with our proposal discarded.
    expect(sendOffer).toHaveBeenCalledTimes(1);
    expect(pc.signalingState).toBe("have-local-offer");
  });

  it("handles glare while the polite peer is still creating its offer", async () => {
    const pc = new FakePeerConnection();
    let releaseOffer!: () => void;
    pc.offerGate = new Promise<void>((resolve) => {
      releaseOffer = resolve;
    });
    const { negotiator, sendOffer, sendAnswer } = createNegotiator(pc, true);

    const localOffer = negotiator.requestOffer();
    await Promise.resolve();

    await expect(
      negotiator.receiveDescription({ type: "offer", sdp: "remote-offer" }),
    ).resolves.toBe(true);
    expect(sendAnswer).toHaveBeenCalledTimes(1);

    releaseOffer();
    await expect(localOffer).resolves.toBe("sent");
    expect(sendOffer).toHaveBeenCalledTimes(1);
  });

  it("lets the impolite peer ignore a colliding offer", async () => {
    const pc = new FakePeerConnection();
    pc.signalingState = "have-local-offer";
    const { negotiator, sendAnswer } = createNegotiator(pc, false);

    await expect(
      negotiator.receiveDescription({ type: "offer", sdp: "remote-offer" }),
    ).resolves.toBe(false);
    expect(sendAnswer).not.toHaveBeenCalled();
    expect(pc.signalingState).toBe("have-local-offer");
  });

  it("rejects malformed descriptions without touching signaling", async () => {
    const pc = new FakePeerConnection();
    const { negotiator, sendAnswer } = createNegotiator(pc, true);

    await expect(
      negotiator.receiveDescription({ type: "offer" }),
    ).resolves.toBe(false);
    expect(sendAnswer).not.toHaveBeenCalled();
    expect(pc.signalingState).toBe("stable");
  });

  it("rejects a delayed answer from an older signaling generation", async () => {
    const pc = new FakePeerConnection();
    pc.createOffer = async () => {
      pc.offers += 1;
      return {
        type: "offer" as const,
        sdp: `v=0\r\na=ice-ufrag:local-${pc.offers}\r\n`,
      };
    };
    const { negotiator, sendOffer } = createNegotiator(pc, false);

    await negotiator.requestOffer();
    const firstGeneration = sendOffer.mock.calls[0]?.[0].generation as string;
    await negotiator.receiveDescription({
      type: "answer",
      sdp: "v=0\r\na=ice-ufrag:remote-1\r\n",
      generation: firstGeneration,
    });

    await negotiator.requestOffer();
    const secondGeneration = sendOffer.mock.calls[1]?.[0].generation as string;
    expect(secondGeneration).not.toBe(firstGeneration);

    await expect(
      negotiator.receiveDescription({
        type: "answer",
        sdp: "stale-answer",
        generation: firstGeneration,
      }),
    ).resolves.toBe(false);
    expect(pc.remoteDescription?.sdp).toContain("remote-1");
  });

  it("labels late ICE with the generation of its own ICE username", async () => {
    const pc = new FakePeerConnection();
    pc.createOffer = async () => {
      pc.offers += 1;
      return {
        type: "offer" as const,
        sdp: `v=0\r\na=ice-ufrag:local-${pc.offers}\r\n`,
      };
    };
    const { negotiator, sendOffer } = createNegotiator(pc, false);

    await negotiator.requestOffer();
    const firstGeneration = sendOffer.mock.calls[0]?.[0].generation as string;
    await negotiator.receiveDescription({
      type: "answer",
      sdp: "answer-1",
      generation: firstGeneration,
    });
    await negotiator.requestOffer();
    const secondGeneration = sendOffer.mock.calls[1]?.[0].generation as string;

    expect(
      negotiator.getGenerationForIceCandidate({
        candidate: "late-first-candidate",
        usernameFragment: "local-1",
      }),
    ).toBe(firstGeneration);
    expect(
      negotiator.getGenerationForIceCandidate({
        candidate: "current-candidate",
        usernameFragment: "local-2",
      }),
    ).toBe(secondGeneration);
  });
});

describe("PeerNegotiator.flushPendingOffer", () => {
  it("is a no-op while the connection is still unstable", async () => {
    const pc = new FakePeerConnection();
    pc.signalingState = "have-local-offer";
    const { negotiator, sendOffer } = createNegotiator(pc, false);

    await negotiator.requestOffer();
    expect(negotiator.hasPendingOffer()).toBe(true);

    await negotiator.flushPendingOffer();

    expect(sendOffer).not.toHaveBeenCalled();
    expect(negotiator.hasPendingOffer()).toBe(true);
  });

  it("sends the queued offer once the connection returns to stable", async () => {
    // This is the onsignalingstatechange path. Without it the queue only
    // drained when another description happened to arrive, so a mic/camera
    // toggle made during an in-flight exchange could be dropped for good.
    const pc = new FakePeerConnection();
    pc.signalingState = "have-local-offer";
    const { negotiator, sendOffer } = createNegotiator(pc, false);

    await negotiator.requestOffer();
    expect(negotiator.hasPendingOffer()).toBe(true);

    pc.signalingState = "stable";
    await negotiator.flushPendingOffer();

    expect(sendOffer).toHaveBeenCalledTimes(1);
    expect(negotiator.hasPendingOffer()).toBe(false);
  });

  it("does nothing when no renegotiation is queued", async () => {
    const pc = new FakePeerConnection();
    const { negotiator, sendOffer } = createNegotiator(pc, false);

    await negotiator.flushPendingOffer();

    expect(sendOffer).not.toHaveBeenCalled();
  });

  it("drains a request that was queued behind an in-flight createOffer", async () => {
    const pc = new FakePeerConnection();
    let release = () => {};
    pc.offerGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { negotiator, sendOffer } = createNegotiator(pc, false);

    const first = negotiator.requestOffer();
    // A second toggle while the first createOffer is still pending.
    await expect(negotiator.requestOffer()).resolves.toBe("queued");

    release();
    pc.offerGate = null;
    await expect(first).resolves.toBe("sent");
    expect(negotiator.hasPendingOffer()).toBe(true);

    pc.signalingState = "stable";
    await negotiator.flushPendingOffer();

    expect(sendOffer).toHaveBeenCalledTimes(2);
  });
});

describe("PeerNegotiator rolled-back offers", () => {
  it("re-issues a polite peer's offer that a colliding offer rolled back", async () => {
    // Reproduces the production defect: relay credentials arrive, the peer
    // calls restartIce() and offers, the remote offer lands first, and the
    // polite rollback discarded our offer for good. Roughly half of all calls
    // ended up with audio flowing in one direction only.
    const pc = new FakePeerConnection();
    const { negotiator, sendOffer, sendAnswer } = createNegotiator(pc, true);

    await negotiator.requestOffer();
    expect(sendOffer).toHaveBeenCalledTimes(1);
    expect(pc.signalingState).toBe("have-local-offer");

    // The remote offer arrives while ours is still outstanding.
    await negotiator.receiveDescription({ type: "offer", sdp: "remote-offer" });

    expect(sendAnswer).toHaveBeenCalledTimes(1);
    // Our proposal must go back on the wire rather than being silently lost.
    expect(sendOffer).toHaveBeenCalledTimes(2);
    expect(negotiator.hasPendingOffer()).toBe(false);
  });

  it("leaves an impolite peer's ignored collision alone", async () => {
    const pc = new FakePeerConnection();
    const { negotiator, sendOffer, sendAnswer } = createNegotiator(pc, false);

    await negotiator.requestOffer();
    const accepted = await negotiator.receiveDescription({
      type: "offer",
      sdp: "remote-offer",
    });

    // The impolite peer keeps its own offer, so there is nothing to re-issue.
    expect(accepted).toBe(false);
    expect(sendAnswer).not.toHaveBeenCalled();
    expect(sendOffer).toHaveBeenCalledTimes(1);
  });
});
