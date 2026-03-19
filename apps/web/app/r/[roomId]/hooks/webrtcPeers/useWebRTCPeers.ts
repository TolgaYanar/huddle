"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

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

  const latestRef = useRef<WebRTCPeersLatest<MediaState>>({
    roomId,
    userId,
    createPeerConnection: null as unknown as (
      peerId: string,
    ) => RTCPeerConnection,
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

  const rtcConfig = useMemo(
    () => ({
      iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
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
          pc.onconnectionstatechange = null;
          pc.close();
        } catch {
          // ignore
        }
      }
      peersRef.current.delete(peerId);
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

  const sendOfferToPeer = useCallback(
    async (peerId: string) => {
      const pc = createPeerConnection(peerId);
      if (pc.signalingState !== "stable") return;

      syncTracksToPeer(peerId, pc);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendWebRTCOffer(peerId, pc.localDescription);
    },
    [createPeerConnection, sendWebRTCOffer, syncTracksToPeer],
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
