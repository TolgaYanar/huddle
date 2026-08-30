type SignalDescription = (
  description: RTCSessionDescriptionInit | null,
) => void;

type PeerNegotiatorOptions = {
  pc: RTCPeerConnection;
  isPolite: () => boolean;
  syncTracks: () => void;
  sendOffer: SignalDescription;
  sendAnswer: SignalDescription;
};

function parseDescription(value: unknown): RTCSessionDescriptionInit | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { type?: unknown; sdp?: unknown };
  if (candidate.type !== "offer" && candidate.type !== "answer") return null;
  if (typeof candidate.sdp !== "string" || !candidate.sdp) return null;
  return { type: candidate.type, sdp: candidate.sdp };
}

/**
 * Per-peer implementation of WebRTC's perfect-negotiation state machine.
 *
 * Both participants can request renegotiation after a media toggle. The
 * deterministic polite role resolves simultaneous offers, while offerPending
 * makes sure a request received during an unstable signaling state is retried
 * after the current exchange returns to stable.
 */
export class PeerNegotiator {
  private readonly pc: RTCPeerConnection;
  private readonly isPolite: () => boolean;
  private readonly syncTracks: () => void;
  private readonly sendOffer: SignalDescription;
  private readonly sendAnswer: SignalDescription;

  private makingOffer = false;
  private settingRemoteAnswer = false;
  private offerPending = false;
  private ignoreOffer = false;

  constructor(options: PeerNegotiatorOptions) {
    this.pc = options.pc;
    this.isPolite = options.isPolite;
    this.syncTracks = options.syncTracks;
    this.sendOffer = options.sendOffer;
    this.sendAnswer = options.sendAnswer;
  }

  async requestOffer(): Promise<"sent" | "queued"> {
    if (
      this.makingOffer ||
      this.settingRemoteAnswer ||
      this.pc.signalingState !== "stable"
    ) {
      this.offerPending = true;
      return "queued";
    }

    this.offerPending = false;
    this.makingOffer = true;
    try {
      this.syncTracks();
      const offer = await this.pc.createOffer();

      // An incoming polite-side offer may have changed signalingState while
      // createOffer() was pending. Preserve our intent and let that exchange
      // finish instead of calling setLocalDescription in the wrong state.
      if (this.pc.signalingState !== "stable") {
        this.offerPending = true;
        return "queued";
      }

      await this.pc.setLocalDescription(offer);
      this.sendOffer(this.pc.localDescription);
      return "sent";
    } finally {
      this.makingOffer = false;
    }
  }

  async receiveDescription(value: unknown): Promise<boolean> {
    const description = parseDescription(value);
    if (!description) return false;

    const readyForOffer =
      !this.makingOffer &&
      (this.pc.signalingState === "stable" || this.settingRemoteAnswer);
    const offerCollision = description.type === "offer" && !readyForOffer;

    this.ignoreOffer = !this.isPolite() && offerCollision;
    if (this.ignoreOffer) return false;

    this.settingRemoteAnswer = description.type === "answer";
    try {
      // Modern WebRTC implementations perform the polite peer's rollback
      // implicitly when an offer is applied in have-local-offer.
      await this.pc.setRemoteDescription(description);
    } finally {
      this.settingRemoteAnswer = false;
    }

    if (description.type === "offer") {
      this.syncTracks();
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.sendAnswer(this.pc.localDescription);
    }

    await this.flushPendingOffer();
    return true;
  }

  shouldIgnoreIceError() {
    return this.ignoreOffer;
  }

  hasPendingOffer() {
    return this.offerPending;
  }

  /**
   * Drain a renegotiation that was queued while the connection was unstable.
   *
   * receiveDescription() calls this after every applied description, but that
   * is not enough on its own: a request queued behind an in-flight createOffer
   * only unblocks when the exchange settles, and an ignored colliding offer
   * returns before the flush. Wiring this to onsignalingstatechange makes
   * "back to stable" the trigger, so a queued mic/camera/screen toggle can
   * never be silently dropped.
   */
  async flushPendingOffer() {
    if (!this.offerPending || this.pc.signalingState !== "stable") return;
    await this.requestOffer();
  }
}
