"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import { parseIceServers } from "./iceServers";
import { PeerNegotiator } from "./negotiation";
import { syncTracksToPeer as syncTracksToPeerImpl } from "./syncTracks";
import type { UseWebRTCPeersArgs, WebRTCPeersLatest } from "./types";
import { useWebRTCPeerSubscriptions } from "./useWebRTCPeerSubscriptions";

export function useWebRTCPeers<MediaState>(
  args: UseWebRTCPeersArgs<MediaState>,
) {
  const {
    isConnected,
    userId,
    roomId,

    ensureLocalStream,

    peersRef,
    remoteStreamsRef,
    setRemoteStreams,
    setRemoteMedia,
    setRemoteSpeaking,

    sendWebRTCIce,
    sendWebRTCOffer,
    sendWebRTCAnswer,

    onRoomUsers,
    onUserJoined,
    onUserLeft,

    onWebRTCOffer,
    onWebRTCAnswer,
    onWebRTCIce,

    onWebRTCMediaState,
    onWebRTCSpeaking,
  } = args;

  const negotiatorsRef = useRef<Map<string, PeerNegotiator>>(new Map());
  const identityRef = useRef(userId);
  const signalingRef = useRef({ sendWebRTCOffer, sendWebRTCAnswer });
  identityRef.current = userId;
  signalingRef.current = { sendWebRTCOffer, sendWebRTCAnswer };

  const latestRef = useRef<WebRTCPeersLatest<MediaState>>({
    roomId,
    userId,
    createPeerConnection: null as unknown as (
      peerId: string,
    ) => RTCPeerConnection,
    getPeerIds: null as unknown as () => string[],
    getExistingPeer: null as unknown as (
      peerId: string,
    ) => RTCPeerConnection | undefined,
    getExistingNegotiator: null as unknown as (
      peerId: string,
    ) => PeerNegotiator | undefined,
    getPeerNegotiator: null as unknown as (peerId: string) => PeerNegotiator,
    sendOfferToPeer: null as unknown as (peerId: string) => Promise<void>,
    closePeer: null as unknown as (peerId: string) => void,
    syncTracksToPeer: null as unknown as (
      peerId: string,
      pc: RTCPeerConnection,
    ) => void,
    sendWebRTCAnswer: null as unknown as (
      to: string,
      sdp: RTCSessionDescriptionInit | null,
    ) => void,
    setRemoteMedia: null as unknown as React.Dispatch<
      React.SetStateAction<Record<string, MediaState>>
    >,
    setRemoteSpeaking: null as unknown as React.Dispatch<
      React.SetStateAction<Record<string, boolean>>
    >,

    onRoomUsers,
    onUserJoined,
    onUserLeft,

    onWebRTCOffer,
    onWebRTCAnswer,
    onWebRTCIce,

    onWebRTCMediaState,
    onWebRTCSpeaking,
  });

  const rtcConfig = useMemo<RTCConfiguration>(
    () => ({
      iceServers: parseIceServers(process.env.NEXT_PUBLIC_ICE_SERVERS),
    }),
    [],
  );

  const updateRemoteStreamsState = useCallback(() => {
    setRemoteStreams(
      Array.from(remoteStreamsRef.current.entries()).map(([id, stream]) => ({
        id,
        stream,
      })),
    );
  }, [remoteStreamsRef, setRemoteStreams]);

  const closePeer = useCallback(
    (peerId: string) => {
      const pc = peersRef.current.get(peerId);
      if (pc) {
        try {
          pc.onicecandidate = null;
          pc.ontrack = null;
          pc.onsignalingstatechange = null;
          pc.onconnectionstatechange = null;
          pc.close();
        } catch {
          // ignore
        }
      }
      peersRef.current.delete(peerId);
      negotiatorsRef.current.delete(peerId);
      remoteStreamsRef.current.delete(peerId);

      setRemoteMedia((prev) => {
        const next = { ...prev };
        delete next[peerId];
        return next;
      });

      setRemoteSpeaking((prev) => {
        const next = { ...prev };
        delete next[peerId];
        return next;
      });

      updateRemoteStreamsState();
    },
    [
      peersRef,
      remoteStreamsRef,
      setRemoteMedia,
      setRemoteSpeaking,
      updateRemoteStreamsState,
    ],
  );

  const syncTracksToPeer = useCallback(
    (_peerId: string, pc: RTCPeerConnection) => {
      syncTracksToPeerImpl(ensureLocalStream, pc);
    },
    [ensureLocalStream],
  );

  const createPeerConnection = useCallback(
    (peerId: string) => {
      const existing = peersRef.current.get(peerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection(rtcConfig);
      peersRef.current.set(peerId, pc);

      const negotiator = new PeerNegotiator({
        pc,
        isPolite: () => identityRef.current > peerId,
        syncTracks: () => syncTracksToPeer(peerId, pc),
        sendOffer: (description) =>
          signalingRef.current.sendWebRTCOffer(peerId, description),
        sendAnswer: (description) =>
          signalingRef.current.sendWebRTCAnswer(peerId, description),
      });
      negotiatorsRef.current.set(peerId, negotiator);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendWebRTCIce(peerId, event.candidate);
        }
      };

      pc.ontrack = (event) => {
        const stream =
          event.streams?.[0] ??
          remoteStreamsRef.current.get(peerId) ??
          new MediaStream();

        // Some browsers may not include streams[0], so ensure track is added.
        if (!stream.getTracks().some((t) => t.id === event.track.id)) {
          try {
            stream.addTrack(event.track);
          } catch {
            // ignore
          }
        }

        remoteStreamsRef.current.set(peerId, stream);
        updateRemoteStreamsState();
      };

      pc.onsignalingstatechange = () => {
        // A renegotiation requested while this peer was mid-exchange is held
        // in the negotiator. Without this trigger it only drained when another
        // description happened to arrive, so a mic/camera toggle made during
        // an in-flight offer could be dropped for the rest of the session.
        if (pc.signalingState !== "stable") return;
        void negotiatorsRef.current.get(peerId)?.flushPendingOffer();
      };

      pc.onconnectionstatechange = () => {
        const s = pc.connectionState;
        // "disconnected" is transient — ICE can self-recover, so don't tear
        // down the peer. Only close on permanent failure or explicit close.
        if (s === "failed" || s === "closed") {
          closePeer(peerId);
        }
      };

      syncTracksToPeer(peerId, pc);
      return pc;
    },
    [
      closePeer,
      peersRef,
      remoteStreamsRef,
      rtcConfig,
      sendWebRTCIce,
      syncTracksToPeer,
      updateRemoteStreamsState,
    ],
  );

  const getPeerIds = useCallback(
    () => Array.from(peersRef.current.keys()),
    [peersRef],
  );

  // Lookups that never create. The ICE path must use these: reconcileRoomUsers
  // and user_left close departed peers, and a straggling candidate arriving
  // afterwards used to re-create a peer entry that is never negotiated and
  // never closed (connectionState stays "new", so onconnectionstatechange
  // never fires to clean it up).
  const getExistingPeer = useCallback(
    (peerId: string) => peersRef.current.get(peerId),
    [peersRef],
  );

  const getExistingNegotiator = useCallback(
    (peerId: string) => negotiatorsRef.current.get(peerId),
    [],
  );

  const getPeerNegotiator = useCallback(
    (peerId: string) => {
      createPeerConnection(peerId);
      const negotiator = negotiatorsRef.current.get(peerId);
      if (!negotiator) {
        throw new Error(`Missing WebRTC negotiator for peer ${peerId}`);
      }
      return negotiator;
    },
    [createPeerConnection],
  );

  const sendOfferToPeer = useCallback(
    async (peerId: string) => {
      await getPeerNegotiator(peerId).requestOffer();
    },
    [getPeerNegotiator],
  );

  const renegotiateAllPeers = useCallback(async () => {
    const ids = Array.from(peersRef.current.keys());
    for (const peerId of ids) {
      try {
        await sendOfferToPeer(peerId);
      } catch {
        // ignore
      }
    }
  }, [peersRef, sendOfferToPeer]);

  const closeAllPeers = useCallback(() => {
    const ids = Array.from(peersRef.current.keys());
    for (const peerId of ids) {
      closePeer(peerId);
    }
  }, [closePeer, peersRef]);

  // Keep the latest values in a ref so our subscription effect doesn't
  // need to re-run when callbacks change (which can cause update loops).
  useEffect(() => {
    latestRef.current.roomId = roomId;
    latestRef.current.userId = userId;

    latestRef.current.createPeerConnection = createPeerConnection;
    latestRef.current.getPeerIds = getPeerIds;
    latestRef.current.getExistingPeer = getExistingPeer;
    latestRef.current.getExistingNegotiator = getExistingNegotiator;
    latestRef.current.getPeerNegotiator = getPeerNegotiator;
    latestRef.current.sendOfferToPeer = sendOfferToPeer;
    latestRef.current.closePeer = closePeer;
    latestRef.current.syncTracksToPeer = syncTracksToPeer;
    latestRef.current.sendWebRTCAnswer = sendWebRTCAnswer;
    latestRef.current.setRemoteMedia = setRemoteMedia;
    latestRef.current.setRemoteSpeaking = setRemoteSpeaking;

    latestRef.current.onRoomUsers = onRoomUsers;
    latestRef.current.onUserJoined = onUserJoined;
    latestRef.current.onUserLeft = onUserLeft;

    latestRef.current.onWebRTCOffer = onWebRTCOffer;
    latestRef.current.onWebRTCAnswer = onWebRTCAnswer;
    latestRef.current.onWebRTCIce = onWebRTCIce;

    latestRef.current.onWebRTCMediaState = onWebRTCMediaState;
    latestRef.current.onWebRTCSpeaking = onWebRTCSpeaking;
  }, [
    roomId,
    userId,
    createPeerConnection,
    getPeerIds,
    getExistingPeer,
    getExistingNegotiator,
    getPeerNegotiator,
    sendOfferToPeer,
    closePeer,
    syncTracksToPeer,
    sendWebRTCAnswer,
    setRemoteMedia,
    setRemoteSpeaking,
    onRoomUsers,
    onUserJoined,
    onUserLeft,
    onWebRTCOffer,
    onWebRTCAnswer,
    onWebRTCIce,
    onWebRTCMediaState,
    onWebRTCSpeaking,
  ]);

  useWebRTCPeerSubscriptions({
    isConnected,
    userId,
    roomId,
    latestRef,
  });

  return {
    closePeer,
    closeAllPeers,
    renegotiateAllPeers,
  };
}
