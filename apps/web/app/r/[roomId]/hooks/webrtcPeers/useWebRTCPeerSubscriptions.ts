import { useEffect, useRef } from "react";

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

export function useWebRTCPeerSubscriptions<MediaState>(args: {
  isConnected: boolean;
  userId: string;
  roomId: string;
  latestRef: WebRTCPeersLatestRef<MediaState>;
}) {
  const { isConnected, userId, roomId, latestRef } = args;

  // Buffer ICE candidates that arrive before remote description is set.
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  const flushPendingIce = async (peerId: string, pc: RTCPeerConnection) => {
    const pending = pendingIceRef.current.get(peerId);
    if (!pending || pending.length === 0) return;
    pendingIceRef.current.delete(peerId);
    for (const candidate of pending) {
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        // ignore
      }
    }
  };

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
    } = latestRef.current;

    const cleanupRoomUsers = _onRoomUsers?.(
      async (data: RoomUsersPayload<MediaState>) => {
        const { roomId: currentRoomId, userId: currentUserId } =
          latestRef.current;
        if (data.roomId !== currentRoomId) return;

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

        for (const peerId of activePeerIds) {
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
      const { userId: currentUserId } = latestRef.current;
      if (!peerId || peerId === currentUserId) return;
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
      pendingIce.delete(peerId);
      latestRef.current.closePeer(peerId);
    });

    const cleanupOffer = _onWebRTCOffer?.(async (data: WebRTCOfferPayload) => {
      const { roomId: currentRoomId, userId: currentUserId } =
        latestRef.current;
      if (data.roomId !== currentRoomId) return;
      if (!data.from || data.from === currentUserId) return;
      const pc = latestRef.current.createPeerConnection(data.from);

      try {
        const accepted = await latestRef.current
          .getPeerNegotiator(data.from)
          .receiveDescription(data.sdp);
        if (!accepted) return;
        await flushPendingIce(data.from, pc);
      } catch {
        // ignore
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
          // ignore
        }
      },
    );

    const cleanupIce = _onWebRTCIce?.(async (data: WebRTCIcePayload) => {
      const { roomId: currentRoomId, userId: currentUserId } =
        latestRef.current;
      if (data.roomId !== currentRoomId) return;
      if (!data.from || data.from === currentUserId) return;
      // Never create a peer connection from the ICE path. A candidate can
      // arrive after reconcileRoomUsers or user_left closed the peer, and
      // creating one here resurrected an entry that is never negotiated and
      // never torn down. Buffer instead: the offer handler is the legitimate
      // entry point and flushPendingIce drains the buffer once it exists.
      const pc = latestRef.current.getExistingPeer(data.from);
      const candidate = data.candidate as RTCIceCandidateInit;

      if (!pc || !pc.remoteDescription) {
        const buf = pendingIce.get(data.from) ?? [];
        // Bound the buffer so candidates for a peer that never materialises
        // cannot grow without limit. A peer connection normally gathers far
        // fewer than this.
        if (buf.length < MAX_BUFFERED_ICE_CANDIDATES) {
          buf.push(candidate);
          pendingIce.set(data.from, buf);
        }
        return;
      }

      try {
        await pc.addIceCandidate(candidate);
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
    };
  }, [isConnected, userId, roomId, latestRef]);
}
