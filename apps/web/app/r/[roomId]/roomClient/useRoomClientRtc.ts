import { useEffect, useRef, useState } from "react";

import type { useRoom as useRoomFn, WebRTCMediaState } from "shared-logic";

import { useMediaDevices, useMediaTracks, useWebRTCPeers } from "../hooks";

import type { RemoteStreamEntry } from "../types";

type Room = ReturnType<typeof useRoomFn>;

type MediaState = WebRTCMediaState;

type PushToTalkDownRef = React.MutableRefObject<boolean>;

type EnsureLocalStream = () => MediaStream | null;

type RenegotiateAllPeers = () => Promise<void>;

export function useRoomClientRtc(args: {
  roomId: string;
  userId: string;
  isClient: boolean;
  room: Room;

  echoCancellationEnabled: boolean;
  noiseSuppressionEnabled: boolean;
  autoGainControlEnabled: boolean;

  pushToTalkEnabled: boolean;
  pushToTalkDownRef: PushToTalkDownRef;
}) {
  const {
    roomId,
    userId,
    isClient,
    room,
    echoCancellationEnabled,
    noiseSuppressionEnabled,
    autoGainControlEnabled,
    pushToTalkEnabled,
    pushToTalkDownRef,
  } = args;

  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const [remoteStreams, setRemoteStreams] = useState<RemoteStreamEntry[]>([]);
  const [remoteSpeaking, setRemoteSpeaking] = useState<Record<string, boolean>>(
    {},
  );
  const [remoteMedia, setRemoteMedia] = useState<Record<string, MediaState>>(
    {},
  );

  const ensureLocalStreamRef = useRef<EnsureLocalStream | null>(null);
  const renegotiateAllPeersRef = useRef<RenegotiateAllPeers | null>(null);
  const mediaStateBroadcastRef = useRef<(() => void) | null>(null);
  const speakingStateBroadcastRef = useRef<(() => void) | null>(null);
  const mediaDevices = useMediaDevices({ isClient });
  const onRoomUsers = room.onRoomUsers;

  const {
    closeAllPeers,
    renegotiateAllPeers,
    peerConnectionStates,
    retryFailedPeers,
  } = useWebRTCPeers<MediaState>({
    isConnected: room.isConnected,
    userId,
    roomId,
    iceAccessToken: room.iceAccessToken,
    ensureLocalStream: () => ensureLocalStreamRef.current?.() ?? null,
    peersRef,
    remoteStreamsRef,
    setRemoteStreams,
    setRemoteMedia,
    setRemoteSpeaking,
    sendWebRTCIce: room.sendWebRTCIce,
    sendWebRTCOffer: room.sendWebRTCOffer,
    sendWebRTCAnswer: room.sendWebRTCAnswer,
    onRoomUsers: room.onRoomUsers,
    onUserJoined: room.onUserJoined,
    onUserLeft: room.onUserLeft,
    onWebRTCOffer: room.onWebRTCOffer,
    onWebRTCAnswer: room.onWebRTCAnswer,
    onWebRTCIce: room.onWebRTCIce,
    onWebRTCMediaState: room.onWebRTCMediaState,
    onWebRTCSpeaking: room.onWebRTCSpeaking,
  });

  useEffect(() => {
    renegotiateAllPeersRef.current = renegotiateAllPeers;
  }, [renegotiateAllPeers]);

  const mediaTracks = useMediaTracks({
    isClient,
    isConnected: room.isConnected,
    userId,
    echoCancellationEnabled,
    noiseSuppressionEnabled,
    autoGainControlEnabled,
    audioInputId: mediaDevices.audioInputId,
    videoInputId: mediaDevices.videoInputId,
    pushToTalkEnabled,
    pushToTalkDownRef,
    sendWebRTCMediaState: room.sendWebRTCMediaState,
    sendWebRTCSpeaking: room.sendWebRTCSpeaking,
    renegotiateAllPeers: () =>
      renegotiateAllPeersRef.current?.() ?? Promise.resolve(),
    onDeviceAccess: mediaDevices.refreshAfterAccess,
  });

  useEffect(() => {
    ensureLocalStreamRef.current = mediaTracks.ensureLocalStream;
    mediaStateBroadcastRef.current = mediaTracks.broadcastCurrentMediaState;
    speakingStateBroadcastRef.current =
      mediaTracks.broadcastCurrentSpeakingState;
  }, [
    mediaTracks.ensureLocalStream,
    mediaTracks.broadcastCurrentMediaState,
    mediaTracks.broadcastCurrentSpeakingState,
  ]);

  useEffect(() => {
    const cleanup = onRoomUsers?.((data) => {
      if (data.roomId !== roomId) return;
      // Socket transport becomes connected before join_room is accepted. The
      // authoritative snapshot is our membership acknowledgement, so repeat
      // any state the server may have correctly rejected before this point.
      mediaStateBroadcastRef.current?.();
      speakingStateBroadcastRef.current?.();
    });
    return () => cleanup?.();
  }, [onRoomUsers, roomId]);

  useEffect(() => {
    return () => {
      closeAllPeers();
      mediaTracks.disableScreen();
      mediaTracks.disableCam(true);
      mediaTracks.disableMic(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeAllPeers]);

  useEffect(() => {
    if (!room.isConnected) {
      // Reconnect starts a new signaling epoch. Keeping a stranded
      // have-local-offer connection can queue every later negotiation forever.
      closeAllPeers();
      return;
    }
    renegotiateAllPeers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.isConnected]);

  return {
    mediaTracks,
    mediaDevices,
    remoteStreams,
    remoteSpeaking,
    remoteMedia,
    peerConnectionStates,
    retryFailedPeers,
  };
}
