import { useCallback, useEffect, useRef } from "react";

import type { UserPresenceData } from "shared-logic";

import type {
  RoomUsersPayload,
  WebRTCIcePayload,
  WebRTCMediaStatePayload,
  WebRTCOfferPayload,
  WebRTCPeersLatestRef,
  WebRTCSpeakingPayload,
} from "./types";
import { reconcileRoomUsers } from "./presence";

// Upper bound on candidates buffered for a peer whose connection does not
// exist yet. Real gathering produces well under 50 per peer.
const MAX_BUFFERED_ICE_CANDIDATES = 100;

type CorrelatedIceCandidate = {
  candidate: RTCIceCandidateInit;
  generation: string | null;
};

function parseCorrelatedIce(value: unknown): CorrelatedIceCandidate | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as RTCIceCandidateInit & { generation?: unknown };
  if (typeof raw.candidate !== "string") return null;
  const generation =
    typeof raw.generation === "string" &&
    raw.generation.length > 0 &&
    raw.generation.length <= 64
      ? raw.generation
      : null;
  return {
    candidate: {
      candidate: raw.candidate,
      sdpMid: raw.sdpMid ?? null,
      sdpMLineIndex: raw.sdpMLineIndex ?? null,
      usernameFragment: raw.usernameFragment ?? null,
    },
    generation,
  };
}

export function useWebRTCPeerSubscriptions<MediaState>(args: {
  isConnected: boolean;
  userId: string;
  roomId: string;
  latestRef: WebRTCPeersLatestRef<MediaState>;
}) {
  const { isConnected, userId, roomId, latestRef } = args;

  // Buffer ICE candidates that arrive before remote description is set.
  const pendingIceRef = useRef<Map<string, CorrelatedIceCandidate[]>>(
    new Map(),
  );

  const flushPendingIce = useCallback(
    async (peerId: string, pc: RTCPeerConnection) => {
      const pending = pendingIceRef.current.get(peerId);
      if (!pending || pending.length === 0) return;
      pendingIceRef.current.delete(peerId);
      const negotiator = latestRef.current.getExistingNegotiator(peerId);
      const activeGeneration = negotiator?.getActiveGeneration() ?? null;
      for (const entry of pending) {
        if (entry.generation && entry.generation !== activeGeneration) {
          continue;
        }
        try {
          await pc.addIceCandidate(entry.candidate);
        } catch {
          // ignore
        }
      }
    },
    [latestRef],
  );

  // Presence + signaling wiring.
  useEffect(() => {
    if (!isConnected) return;
    if (!userId) return;
    const pendingIce = pendingIceRef.current;

    const {
      onRoomUsers: _onRoomUsers,
      onUserJoined: _onUserJoined,
      onUserLeft: _onUserLeft,
      onWebRTCOffer: _onWebRTCOffer,
      onWebRTCAnswer: _onWebRTCAnswer,
      onWebRTCIce: _onWebRTCIce,
      onWebRTCMediaState: _onWebRTCMediaState,
      onWebRTCSpeaking: _onWebRTCSpeaking,
      replaceActivePeerIds: _replaceActivePeerIds,
    } = latestRef.current;
    // `room_users` is the authoritative snapshot for this socket session.
    // The signaling channels can replay an offer that was buffered before the
    // peer consumers mounted; once a snapshot says that sender is absent, that
    // older offer must not resurrect a departed peer.
    let authoritativePeerIds: Set<string> | null = null;

    const cleanupRoomUsers = _onRoomUsers?.(
      async (data: RoomUsersPayload<MediaState>) => {
        if (data.roomId !== latestRef.current.roomId) return;
        const currentUserId = latestRef.current.userId;

        // Presence is authoritative and must be recorded before waiting for
        // the ICE lookup. A leave can arrive while that promise is pending;
        // the active-peer check below then prevents the stale snapshot from
        // resurrecting the departed connection.
        const snapshotPeerIds = new Set(
          (Array.isArray(data.users) ? data.users : []).filter(
            (peerId) => Boolean(peerId) && peerId !== currentUserId,
          ),
        );
        authoritativePeerIds = snapshotPeerIds;
        for (const pendingPeerId of pendingIce.keys()) {
          if (!snapshotPeerIds.has(pendingPeerId)) {
            pendingIce.delete(pendingPeerId);
          }
        }
        latestRef.current.replaceActivePeerIds(snapshotPeerIds);

        const activePeerIds = reconcileRoomUsers({
          users: Array.isArray(data.users) ? data.users : [],
          currentUserId,
          peerIds: latestRef.current.getPeerIds(),
          mediaStates: data.mediaStates,
          closePeer: latestRef.current.closePeer,
          clearPendingIce: (peerId) => pendingIce.delete(peerId),
          setRemoteMedia: latestRef.current.setRemoteMedia,
          setRemoteSpeaking: latestRef.current.setRemoteSpeaking,
        });

        await latestRef.current.iceReady;
        const { roomId: currentRoomId, userId: latestUserId } =
          latestRef.current;
        if (data.roomId !== currentRoomId) return;
        if (latestUserId !== currentUserId) return;

        for (const peerId of activePeerIds) {
          if (!latestRef.current.isPeerActive(peerId)) continue;
          // Deterministic initiator to reduce offer glare.
          if (currentUserId < peerId) {
            try {
              await latestRef.current.sendOfferToPeer(peerId);
            } catch {
              // ignore
            }
          } else {
            // Ensure the pc exists so we're ready to answer.
            latestRef.current.createPeerConnection(peerId);
          }
        }
      },
    );

    const toSocketId = (peer: UserPresenceData) =>
      typeof peer === "string" ? peer : peer?.socketId;

    const cleanupJoined = _onUserJoined?.(async (peer) => {
      const peerId = toSocketId(peer);
      if (!peerId || peerId === latestRef.current.userId) return;
      authoritativePeerIds?.add(peerId);
      latestRef.current.markPeerActive(peerId);
      const joiningUserId = latestRef.current.userId;
      await latestRef.current.iceReady;
      const { userId: currentUserId } = latestRef.current;
      if (currentUserId !== joiningUserId) return;
      if (peerId === currentUserId) return;
      if (!latestRef.current.isPeerActive(peerId)) return;
      if (currentUserId < peerId) {
        try {
          await latestRef.current.sendOfferToPeer(peerId);
        } catch {
          // ignore
        }
      } else {
        latestRef.current.createPeerConnection(peerId);
      }
    });

    const cleanupLeft = _onUserLeft?.((peer) => {
      const peerId = toSocketId(peer);
      if (!peerId) return;
      authoritativePeerIds?.delete(peerId);
      latestRef.current.markPeerInactive(peerId);
      pendingIce.delete(peerId);
      latestRef.current.closePeer(peerId);
    });

    const cleanupOffer = _onWebRTCOffer?.(async (data: WebRTCOfferPayload) => {
      if (data.roomId !== latestRef.current.roomId) return;
      if (!data.from || data.from === latestRef.current.userId) return;
      if (authoritativePeerIds && !authoritativePeerIds.has(data.from)) return;
      // The server only forwards signaling between current room members, so
      // a valid offer is also evidence of presence. Mark it synchronously:
      // an offer can be the first replayed event after the listeners attach.
      // A later user_left removes it before the post-ICE check below.
      latestRef.current.markPeerActive(data.from);
      // Candidates that arrive while this waits are buffered by the ICE
      // handler below and flushed once the peer exists.
      await latestRef.current.iceReady;
      const { roomId: currentRoomId, userId: currentUserId } =
        latestRef.current;
      if (data.roomId !== currentRoomId) return;
      if (!data.from || data.from === currentUserId) return;
      if (authoritativePeerIds && !authoritativePeerIds.has(data.from)) return;
      if (!latestRef.current.isPeerActive(data.from)) return;
      const pc = latestRef.current.createPeerConnection(data.from);

      try {
        const accepted = await latestRef.current
          .getPeerNegotiator(data.from)
          .receiveDescription(data.sdp);
        if (!accepted) return;
        await flushPendingIce(data.from, pc);
      } catch {
        // The remote offer may already have moved the connection into
        // have-remote-offer before answer creation/sending fails. A connected
        // transport does not necessarily emit another state change for this
        // signaling failure, so rebuild it explicitly instead of leaving all
        // future renegotiations wedged behind the half-applied offer.
        latestRef.current.recoverPeer(data.from, pc);
      }
    });

    const cleanupAnswer = _onWebRTCAnswer?.(
      async (data: WebRTCOfferPayload) => {
        const { roomId: currentRoomId, userId: currentUserId } =
          latestRef.current;
        if (data.roomId !== currentRoomId) return;
        if (!data.from || data.from === currentUserId) return;
        // An answer only makes sense for a peer we already offered to. Do not
        // create one here: a straggling answer arriving after the peer was
        // closed (reconcileRoomUsers / user_left) would otherwise resurrect an
        // entry that nothing ever negotiates or tears down. The offer handler
        // remains the one legitimate creation point.
        const pc = latestRef.current.getExistingPeer(data.from);
        const negotiator = latestRef.current.getExistingNegotiator(data.from);
        if (!pc || !negotiator) return;
        try {
          const accepted = await negotiator.receiveDescription(data.sdp);
          if (!accepted) return;
          await flushPendingIce(data.from, pc);
        } catch {
          // A failed answer application can likewise leave the signaling
          // state unusable while connectionState still says connected.
          latestRef.current.recoverPeer(data.from, pc);
        }
      },
    );

    const cleanupIce = _onWebRTCIce?.(async (data: WebRTCIcePayload) => {
      const { roomId: currentRoomId, userId: currentUserId } =
        latestRef.current;
      if (data.roomId !== currentRoomId) return;
      if (!data.from || data.from === currentUserId) return;
      if (authoritativePeerIds && !authoritativePeerIds.has(data.from)) return;
      // Never create a peer connection from the ICE path. A candidate can
      // arrive after reconcileRoomUsers or user_left closed the peer, and
      // creating one here resurrected an entry that is never negotiated and
      // never torn down. Buffer instead: the offer handler is the legitimate
      // entry point and flushPendingIce drains the buffer once it exists.
      const pc = latestRef.current.getExistingPeer(data.from);
      const correlatedCandidate = parseCorrelatedIce(data.candidate);
      if (!correlatedCandidate) return;

      if (!pc || !pc.remoteDescription) {
        const buf = pendingIce.get(data.from) ?? [];
        // Bound the buffer so candidates for a peer that never materialises
        // cannot grow without limit. A peer connection normally gathers far
        // fewer than this.
        if (buf.length < MAX_BUFFERED_ICE_CANDIDATES) {
          buf.push(correlatedCandidate);
          pendingIce.set(data.from, buf);
        }
        return;
      }

      const activeGeneration = latestRef.current
        .getExistingNegotiator(data.from)
        ?.getActiveGeneration();
      if (
        correlatedCandidate.generation &&
        correlatedCandidate.generation !== activeGeneration
      ) {
        return;
      }

      try {
        await pc.addIceCandidate(correlatedCandidate.candidate);
      } catch (error) {
        // Candidates belonging to an intentionally ignored colliding offer are
        // expected to fail. Keep other failures visible during development.
        if (
          !latestRef.current
            .getExistingNegotiator(data.from)
            ?.shouldIgnoreIceError()
        ) {
          console.warn("Failed to add WebRTC ICE candidate", error);
        }
      }
    });

    const cleanupMedia = _onWebRTCMediaState?.(
      (data: WebRTCMediaStatePayload<MediaState>) => {
        const { roomId: currentRoomId, userId: currentUserId } =
          latestRef.current;
        if (data.roomId !== currentRoomId) return;
        if (!data.from || data.from === currentUserId) return;
        if (!latestRef.current.isPeerActive(data.from)) return;
        latestRef.current.setRemoteMedia((prev) => ({
          ...prev,
          [data.from]: data.state,
        }));
      },
    );

    const cleanupSpeaking = _onWebRTCSpeaking?.(
      (data: WebRTCSpeakingPayload) => {
        const { roomId: currentRoomId, userId: currentUserId } =
          latestRef.current;
        if (data.roomId !== currentRoomId) return;
        if (!data.from || data.from === currentUserId) return;
        if (!latestRef.current.isPeerActive(data.from)) return;
        latestRef.current.setRemoteSpeaking((prev) => ({
          ...prev,
          [data.from]: data.speaking,
        }));
      },
    );

    return () => {
      (cleanupRoomUsers as (() => void) | undefined)?.();
      (cleanupJoined as (() => void) | undefined)?.();
      (cleanupLeft as (() => void) | undefined)?.();
      (cleanupOffer as (() => void) | undefined)?.();
      (cleanupAnswer as (() => void) | undefined)?.();
      (cleanupIce as (() => void) | undefined)?.();
      (cleanupMedia as (() => void) | undefined)?.();
      (cleanupSpeaking as (() => void) | undefined)?.();
      pendingIce.clear();
      _replaceActivePeerIds([]);
    };
  }, [isConnected, userId, roomId, latestRef, flushPendingIce]);
}
