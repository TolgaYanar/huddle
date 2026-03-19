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

        if (data.mediaStates && typeof data.mediaStates === "object") {
          latestRef.current.setRemoteMedia((prev) => ({
            ...prev,
            ...data.mediaStates,
          }));
        }

        for (const peerId of data.users) {
          if (!peerId || peerId === currentUserId) continue;
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
      pendingIceRef.current.delete(peerId);
      latestRef.current.closePeer(peerId);
    });

    const cleanupOffer = _onWebRTCOffer?.(async (data: WebRTCOfferPayload) => {
      const { roomId: currentRoomId, userId: currentUserId } =
        latestRef.current;
      if (data.roomId !== currentRoomId) return;
      if (!data.from || data.from === currentUserId) return;
      const pc = latestRef.current.createPeerConnection(data.from);

      try {
        await pc.setRemoteDescription(data.sdp as RTCSessionDescriptionInit);
        await flushPendingIce(data.from, pc);
        latestRef.current.syncTracksToPeer(data.from, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        latestRef.current.sendWebRTCAnswer(data.from, pc.localDescription);
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
        const pc = latestRef.current.createPeerConnection(data.from);
        try {
          await pc.setRemoteDescription(data.sdp as RTCSessionDescriptionInit);
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
      const pc = latestRef.current.createPeerConnection(data.from);
      const candidate = data.candidate as RTCIceCandidateInit;
      // If remote description isn't set yet, buffer the candidate.
      if (!pc.remoteDescription) {
        const buf = pendingIceRef.current.get(data.from) ?? [];
        buf.push(candidate);
        pendingIceRef.current.set(data.from, buf);
        return;
      }
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        // ignore
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
    };
  }, [isConnected, userId, roomId, latestRef]);
}
