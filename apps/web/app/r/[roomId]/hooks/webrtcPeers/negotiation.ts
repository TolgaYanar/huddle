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

// How long an offer may go unanswered before it is rolled back and sent again.
// A healthy answer arrives well within a second; the longest legitimate delay
// on the answering side is its ICE-config gate, bounded at 3 s.
export const OFFER_ANSWER_TIMEOUT_MS = 10_000;

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
  private answerTimer: ReturnType<typeof setTimeout> | null = null;
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
      this.armAnswerTimeout(generation);
      return "sent";
    } finally {
      this.makingOffer = false;
    }
  }

  /** Stop the unanswered-offer timer; call when the connection is discarded. */
  dispose() {
    if (this.answerTimer) clearTimeout(this.answerTimer);
    this.answerTimer = null;
  }

  private armAnswerTimeout(generation: string) {
    this.dispose();
    this.answerTimer = setTimeout(() => {
      this.answerTimer = null;
      void this.reissueUnansweredOffer(generation).catch(() => {
        // The connection's own recovery remains the fallback.
      });
    }, OFFER_ANSWER_TIMEOUT_MS);
  }

  /**
   * An offer whose answer never arrives leaves this side in have-local-offer
   * for good. The relay can drop one without a word — its rate limit does —
   * and a connected transport has no watchdog that would notice, so every
   * later renegotiation queued behind it and a microphone turned on afterwards
   * never reached that peer. Roll the offer back and send a fresh one; a late
   * answer to the abandoned offer is then refused by its generation.
   */
  private async reissueUnansweredOffer(generation: string) {
    if (this.pc.signalingState !== "have-local-offer") return;
    if (this.activeGeneration !== generation) return;
    if (this.makingOffer || this.settingRemoteAnswer) return;
    this.activeGeneration = null;
    await this.pc.setLocalDescription({ type: "rollback" });
    this.offerPending = true;
    await this.flushPendingOffer();
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

    // A polite peer accepts a colliding offer, and setRemoteDescription below
    // implicitly rolls back the offer this peer had already put on the wire.
    // Everything that offer carried goes with it — an ICE restart requested
    // when relay credentials arrived, and any track added since the last
    // exchange — and nothing else re-issues it, because requestOffer() cleared
    // offerPending when it sent. That left the polite side of a glare unable
    // to send media at all: its transceiver read sendrecv while its encoder
    // never started. Re-arm the request so the flush at the end of this
    // exchange puts our own proposal back on the wire.
    if (offerCollision) this.offerPending = true;

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
      // Nothing else would ever offer a track this answer could not carry:
      // this side is not the pair's deterministic initiator, and the
      // browser's negotiationneeded has no listener. Offer it once stable.
      if (this.hasUnnegotiatedLocalTrack()) this.offerPending = true;
    }

    await this.flushPendingOffer();
    return true;
  }

  /**
   * A live local track that no negotiated m-line carries yet.
   *
   * The remote offer decides which media kinds an answer may include, so a
   * track syncTracks() attached for a kind that offer lacked is left on a
   * transceiver with no mid. When the pair's initiator had no camera, the
   * answerer's camera never reached it; when it had only a camera, the
   * answerer's microphone never did. Measured in rooms of three to six, a
   * participant who turned on only their camera heard nobody whose socket id
   * sorted above theirs, and one with only a microphone saw none of those
   * participants' cameras. Only an unassociated transceiver counts: our next
   * offer gives it a mid, so this cannot trigger a second round.
   */
  private hasUnnegotiatedLocalTrack() {
    return this.pc
      .getTransceivers()
      .some(
        (transceiver) =>
          transceiver.mid === null &&
          transceiver.currentDirection !== "stopped" &&
          transceiver.sender.track?.readyState === "live",
      );
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
