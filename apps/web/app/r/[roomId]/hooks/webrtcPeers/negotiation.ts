export type CorrelatedDescription = RTCSessionDescriptionInit & {
  generation?: string;
};

type SignalDescription = (
  description: CorrelatedDescription | null,
) => boolean | void;

type PeerNegotiatorOptions = {
  pc: RTCPeerConnection;
  isPolite: () => boolean;
  syncTracks: () => void | Promise<void>;
  sendOffer: SignalDescription;
  sendAnswer: SignalDescription;
};

function parseDescription(value: unknown): {
  description: RTCSessionDescriptionInit;
  generation: string | null;
} | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as {
    type?: unknown;
    sdp?: unknown;
    generation?: unknown;
  };
  if (candidate.type !== "offer" && candidate.type !== "answer") return null;
  if (typeof candidate.sdp !== "string" || !candidate.sdp) return null;
  const generation =
    typeof candidate.generation === "string" &&
    candidate.generation.length > 0 &&
    candidate.generation.length <= 64
      ? candidate.generation
      : null;
  return {
    description: { type: candidate.type, sdp: candidate.sdp },
    generation,
  };
}

let nextGeneration = 0;
function createGeneration() {
  nextGeneration += 1;
  return `rtc-${Date.now().toString(36)}-${nextGeneration.toString(36)}`;
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
  private readonly syncTracks: () => void | Promise<void>;
  private readonly sendOffer: SignalDescription;
  private readonly sendAnswer: SignalDescription;

  private makingOffer = false;
  private settingRemoteAnswer = false;
  private offerPending = false;
  private ignoreOffer = false;
  private activeGeneration: string | null = null;
  private readonly localIceGenerations = new Map<string, string | null>();

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
      await this.syncTracks();
      const offer = await this.pc.createOffer();
      const generation = createGeneration();

      // An incoming polite-side offer may have changed signalingState while
      // createOffer() was pending. Preserve our intent and let that exchange
      // finish instead of calling setLocalDescription in the wrong state.
      if (this.pc.signalingState !== "stable") {
        this.offerPending = true;
        return "queued";
      }

      this.activeGeneration = generation;
      await this.pc.setLocalDescription(offer);
      const local = this.pc.localDescription ?? offer;
      this.rememberLocalIceGeneration(local, generation);
      const sent = this.sendOffer({
        type: local.type,
        sdp: local.sdp,
        generation,
      });
      if (sent === false) {
        throw new Error(
          "WebRTC offer could not be sent while signaling was offline",
        );
      }
      return "sent";
    } finally {
      this.makingOffer = false;
    }
  }

  async receiveDescription(value: unknown): Promise<boolean> {
    const parsed = parseDescription(value);
    if (!parsed) return false;
    const { description, generation } = parsed;

    if (
      description.type === "answer" &&
      generation &&
      generation !== this.activeGeneration
    ) {
      return false;
    }

    const readyForOffer =
      !this.makingOffer &&
      (this.pc.signalingState === "stable" || this.settingRemoteAnswer);
    const offerCollision = description.type === "offer" && !readyForOffer;

    this.ignoreOffer = !this.isPolite() && offerCollision;
    if (this.ignoreOffer) return false;

    if (description.type === "offer") {
      // The answer and every ICE candidate generated from it belong to the
      // offerer's transaction. Legacy peers omit the field and remain
      // compatible, while correlated peers can reject stale recovery traffic.
      this.activeGeneration = generation;
    }

    this.settingRemoteAnswer = description.type === "answer";
    try {
      // Modern WebRTC implementations perform the polite peer's rollback
      // implicitly when an offer is applied in have-local-offer.
      await this.pc.setRemoteDescription(description);
    } finally {
      this.settingRemoteAnswer = false;
    }

    if (description.type === "offer") {
      await this.syncTracks();
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      const local = this.pc.localDescription ?? answer;
      this.rememberLocalIceGeneration(local, generation);
      const sent = this.sendAnswer({
        type: local.type,
        sdp: local.sdp,
        ...(generation ? { generation } : {}),
      });
      if (sent === false) {
        throw new Error(
          "WebRTC answer could not be sent while signaling was offline",
        );
      }
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

  getActiveGeneration() {
    return this.activeGeneration;
  }

  getGenerationForIceCandidate(candidate: RTCIceCandidateInit) {
    const usernameFragment = candidate.usernameFragment;
    if (
      typeof usernameFragment === "string" &&
      this.localIceGenerations.has(usernameFragment)
    ) {
      return this.localIceGenerations.get(usernameFragment) ?? null;
    }
    return this.activeGeneration;
  }

  private rememberLocalIceGeneration(
    description: RTCSessionDescriptionInit,
    generation: string | null,
  ) {
    const match = description.sdp?.match(/^a=ice-ufrag:([^\r\n]+)$/m);
    const usernameFragment = match?.[1]?.trim();
    if (!usernameFragment) return;
    this.localIceGenerations.set(usernameFragment, generation);

    // Long sessions can rotate ICE credentials many times. We only need a
    // short overlap window to label candidates from the previous exchange.
    while (this.localIceGenerations.size > 8) {
      const oldest = this.localIceGenerations.keys().next().value;
      if (typeof oldest !== "string") break;
      this.localIceGenerations.delete(oldest);
    }
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
