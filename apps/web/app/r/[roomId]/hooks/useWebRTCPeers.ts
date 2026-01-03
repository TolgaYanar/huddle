"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { UserPresenceData } from "shared-logic";

type RemoteStreamsState = Array<{ id: string; stream: MediaStream }>;

type RoomUsersPayload<MediaState> = {
  roomId: string;
  users: string[];
  mediaStates?: Record<string, MediaState>;
};

type WebRTCFromPayload = {
  roomId: string;
  from: string;
};

type WebRTCOfferPayload = WebRTCFromPayload & {
  sdp: unknown;
};

type WebRTCIcePayload = WebRTCFromPayload & {
  candidate: unknown;
};

type WebRTCMediaStatePayload<MediaState> = WebRTCFromPayload & {
  state: MediaState;
};

type WebRTCSpeakingPayload = WebRTCFromPayload & {
  speaking: boolean;
};

export function useWebRTCPeers<MediaState>({
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
}: {
  isConnected: boolean;
  userId: string;
  roomId: string;

  ensureLocalStream: () => MediaStream | null;

  peersRef: React.MutableRefObject<Map<string, RTCPeerConnection>>;
  remoteStreamsRef: React.MutableRefObject<Map<string, MediaStream>>;
  setRemoteStreams: React.Dispatch<React.SetStateAction<RemoteStreamsState>>;
  setRemoteMedia: React.Dispatch<
    React.SetStateAction<Record<string, MediaState>>
  >;
  setRemoteSpeaking: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;

  sendWebRTCIce: (to: string, candidate: RTCIceCandidate) => void;
  sendWebRTCOffer: (to: string, sdp: RTCSessionDescriptionInit | null) => void;
  sendWebRTCAnswer: (to: string, sdp: RTCSessionDescriptionInit | null) => void;

  onRoomUsers:
    | ((
        handler: (data: RoomUsersPayload<MediaState>) => void | Promise<void>
      ) => (() => void) | void)
    | undefined;
  onUserJoined:
    | ((
        handler: (peer: UserPresenceData) => void | Promise<void>
      ) => (() => void) | void)
    | undefined;
  onUserLeft:
    | ((handler: (peer: UserPresenceData) => void) => (() => void) | void)
    | undefined;

  onWebRTCOffer:
    | ((
        handler: (data: WebRTCOfferPayload) => void | Promise<void>
      ) => (() => void) | void)
    | undefined;
  onWebRTCAnswer:
    | ((
        handler: (data: WebRTCOfferPayload) => void | Promise<void>
      ) => (() => void) | void)
    | undefined;
  onWebRTCIce:
    | ((
        handler: (data: WebRTCIcePayload) => void | Promise<void>
      ) => (() => void) | void)
    | undefined;

  onWebRTCMediaState:
    | ((
        handler: (data: WebRTCMediaStatePayload<MediaState>) => void
      ) => (() => void) | void)
    | undefined;
  onWebRTCSpeaking:
    | ((handler: (data: WebRTCSpeakingPayload) => void) => (() => void) | void)
    | undefined;
}) {
  const latestRef = useRef({
    roomId,
    userId,
    createPeerConnection: null as unknown as (
      peerId: string
    ) => RTCPeerConnection,
    sendOfferToPeer: null as unknown as (peerId: string) => Promise<void>,
    closePeer: null as unknown as (peerId: string) => void,
    syncTracksToPeer: null as unknown as (
      peerId: string,
      pc: RTCPeerConnection
    ) => void,
    sendWebRTCAnswer: null as unknown as (
      to: string,
      sdp: RTCSessionDescriptionInit | null
    ) => void,
    setRemoteMedia: null as unknown as React.Dispatch<
      React.SetStateAction<Record<string, MediaState>>
    >,
    setRemoteSpeaking: null as unknown as React.Dispatch<
      React.SetStateAction<Record<string, boolean>>
    >,

    onRoomUsers: undefined as typeof onRoomUsers,
    onUserJoined: undefined as typeof onUserJoined,
    onUserLeft: undefined as typeof onUserLeft,

    onWebRTCOffer: undefined as typeof onWebRTCOffer,
    onWebRTCAnswer: undefined as typeof onWebRTCAnswer,
    onWebRTCIce: undefined as typeof onWebRTCIce,

    onWebRTCMediaState: undefined as typeof onWebRTCMediaState,
    onWebRTCSpeaking: undefined as typeof onWebRTCSpeaking,
  });

  const rtcConfig = useMemo(
    () => ({
      iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }],
    }),
    []
  );

  const updateRemoteStreamsState = useCallback(() => {
    setRemoteStreams(
      Array.from(remoteStreamsRef.current.entries()).map(([id, stream]) => ({
        id,
        stream,
      }))
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
    ]
  );

  const syncTracksToPeer = useCallback(
    (peerId: string, pc: RTCPeerConnection) => {
      const localStream = ensureLocalStream();
      if (!localStream) return;
      const localTracks = localStream.getTracks();

      // Remove senders whose tracks are no longer present.
      for (const sender of pc.getSenders()) {
        const t = sender.track;
        if (!t) continue;
        const stillPresent = localTracks.some((lt) => lt.id === t.id);
        if (!stillPresent) {
          try {
            pc.removeTrack(sender);
          } catch {
            // ignore
          }
        }
      }

      // Add/replace senders for current tracks.
      for (const track of localTracks) {
        const sameKindSenders = pc
          .getSenders()
          .filter((s) => s.track && s.track.kind === track.kind);

        if (track.kind === "audio") {
          const sender = sameKindSenders[0];
          if (!sender) {
            pc.addTrack(track, localStream);
          } else if (sender.track?.id !== track.id) {
            sender.replaceTrack(track);
          }
        }

        if (track.kind === "video") {
          const sender = sameKindSenders[0];
          if (!sender) {
            pc.addTrack(track, localStream);
          } else if (sender.track?.id !== track.id) {
            sender.replaceTrack(track);
          }
        }
      }
    },
    [ensureLocalStream]
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
        if (s === "failed" || s === "disconnected" || s === "closed") {
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
    ]
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
    [createPeerConnection, sendWebRTCOffer, syncTracksToPeer]
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

    const cleanupRoomUsers = _onRoomUsers?.(async (data) => {
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
    });

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
      latestRef.current.closePeer(peerId);
    });

    const cleanupOffer = _onWebRTCOffer?.(async (data) => {
      const { roomId: currentRoomId, userId: currentUserId } =
        latestRef.current;
      if (data.roomId !== currentRoomId) return;
      if (!data.from || data.from === currentUserId) return;
      const pc = latestRef.current.createPeerConnection(data.from);

      try {
        await pc.setRemoteDescription(data.sdp as RTCSessionDescriptionInit);
        latestRef.current.syncTracksToPeer(data.from, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        latestRef.current.sendWebRTCAnswer(data.from, pc.localDescription);
      } catch {
        // ignore
      }
    });

    const cleanupAnswer = _onWebRTCAnswer?.(async (data) => {
      const { roomId: currentRoomId, userId: currentUserId } =
        latestRef.current;
      if (data.roomId !== currentRoomId) return;
      if (!data.from || data.from === currentUserId) return;
      const pc = latestRef.current.createPeerConnection(data.from);
      try {
        await pc.setRemoteDescription(data.sdp as RTCSessionDescriptionInit);
      } catch {
        // ignore
      }
    });

    const cleanupIce = _onWebRTCIce?.(async (data) => {
      const { roomId: currentRoomId, userId: currentUserId } =
        latestRef.current;
      if (data.roomId !== currentRoomId) return;
      if (!data.from || data.from === currentUserId) return;
      const pc = latestRef.current.createPeerConnection(data.from);
      try {
        await pc.addIceCandidate(data.candidate as RTCIceCandidateInit);
      } catch {
        // ignore
      }
    });

    const cleanupMedia = _onWebRTCMediaState?.((data) => {
      const { roomId: currentRoomId, userId: currentUserId } =
        latestRef.current;
      if (data.roomId !== currentRoomId) return;
      if (!data.from || data.from === currentUserId) return;
      latestRef.current.setRemoteMedia((prev) => ({
        ...prev,
        [data.from]: data.state,
      }));
    });

    const cleanupSpeaking = _onWebRTCSpeaking?.((data) => {
      const { roomId: currentRoomId, userId: currentUserId } =
        latestRef.current;
      if (data.roomId !== currentRoomId) return;
      if (!data.from || data.from === currentUserId) return;
      latestRef.current.setRemoteSpeaking((prev) => ({
        ...prev,
        [data.from]: data.speaking,
      }));
    });

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
  }, [isConnected, userId, roomId]);

  return {
    closePeer,
    closeAllPeers,
    renegotiateAllPeers,
  };
}
