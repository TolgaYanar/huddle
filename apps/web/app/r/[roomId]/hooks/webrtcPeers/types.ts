import type { UserPresenceData } from "shared-logic";

import type { PeerNegotiator } from "./negotiation";

export type RemoteStreamsState = Array<{ id: string; stream: MediaStream }>;

export type PeerConnectionStatus =
  | "connecting"
  | "connected"
  | "recovering"
  | "failed";

export type RoomUsersPayload<MediaState> = {
  roomId: string;
  users: string[];
  mediaStates?: Record<string, MediaState>;
};

export type WebRTCFromPayload = {
  roomId: string;
  from: string;
};

export type WebRTCOfferPayload = WebRTCFromPayload & {
  sdp: unknown;
};

export type WebRTCIcePayload = WebRTCFromPayload & {
  candidate: unknown;
};

export type WebRTCMediaStatePayload<MediaState> = WebRTCFromPayload & {
  state: MediaState;
};

export type WebRTCSpeakingPayload = WebRTCFromPayload & {
  speaking: boolean;
};

export type UseWebRTCPeersArgs<MediaState> = {
  isConnected: boolean;
  userId: string;
  roomId: string;
  iceAccessToken?: string | null;

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

  sendWebRTCIce: (to: string, candidate: RTCIceCandidateInit) => boolean | void;
  sendWebRTCOffer: (
    to: string,
    sdp: RTCSessionDescriptionInit | null,
  ) => boolean | void;
  sendWebRTCAnswer: (
    to: string,
    sdp: RTCSessionDescriptionInit | null,
  ) => boolean | void;

  onRoomUsers:
    | ((
        handler: (data: RoomUsersPayload<MediaState>) => void | Promise<void>,
      ) => (() => void) | void)
    | undefined;
  onUserJoined:
    | ((
        handler: (peer: UserPresenceData) => void | Promise<void>,
      ) => (() => void) | void)
    | undefined;
  onUserLeft:
    | ((handler: (peer: UserPresenceData) => void) => (() => void) | void)
    | undefined;

  onWebRTCOffer:
    | ((
        handler: (data: WebRTCOfferPayload) => void | Promise<void>,
      ) => (() => void) | void)
    | undefined;
  onWebRTCAnswer:
    | ((
        handler: (data: WebRTCOfferPayload) => void | Promise<void>,
      ) => (() => void) | void)
    | undefined;
  onWebRTCIce:
    | ((
        handler: (data: WebRTCIcePayload) => void | Promise<void>,
      ) => (() => void) | void)
    | undefined;

  onWebRTCMediaState:
    | ((
        handler: (data: WebRTCMediaStatePayload<MediaState>) => void,
      ) => (() => void) | void)
    | undefined;
  onWebRTCSpeaking:
    | ((handler: (data: WebRTCSpeakingPayload) => void) => (() => void) | void)
    | undefined;
};

export type WebRTCPeersLatest<MediaState> = {
  roomId: string;
  userId: string;

  // Resolves once the first ICE server lookup has settled (success, failure
  // or timeout). Peer creation waits on it so the first connection of a
  // session gets the relay credentials instead of racing the fetch.
  iceReady: Promise<void>;

  createPeerConnection: (peerId: string) => RTCPeerConnection;
  getPeerIds: () => string[];
  getExistingPeer: (peerId: string) => RTCPeerConnection | undefined;
  getExistingNegotiator: (peerId: string) => PeerNegotiator | undefined;
  getPeerNegotiator: (peerId: string) => PeerNegotiator;
  sendOfferToPeer: (peerId: string) => Promise<void>;
  recoverPeer: (peerId: string, pc: RTCPeerConnection) => void;
  closePeer: (peerId: string) => void;
  syncTracksToPeer: (peerId: string, pc: RTCPeerConnection) => Promise<void>;
  replaceActivePeerIds: (peerIds: Iterable<string>) => void;
  markPeerActive: (peerId: string) => void;
  markPeerInactive: (peerId: string) => void;
  isPeerActive: (peerId: string) => boolean;

  sendWebRTCAnswer: (
    to: string,
    sdp: RTCSessionDescriptionInit | null,
  ) => boolean | void;
  setRemoteMedia: React.Dispatch<
    React.SetStateAction<Record<string, MediaState>>
  >;
  setRemoteSpeaking: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;

  onRoomUsers: UseWebRTCPeersArgs<MediaState>["onRoomUsers"];
  onUserJoined: UseWebRTCPeersArgs<MediaState>["onUserJoined"];
  onUserLeft: UseWebRTCPeersArgs<MediaState>["onUserLeft"];

  onWebRTCOffer: UseWebRTCPeersArgs<MediaState>["onWebRTCOffer"];
  onWebRTCAnswer: UseWebRTCPeersArgs<MediaState>["onWebRTCAnswer"];
  onWebRTCIce: UseWebRTCPeersArgs<MediaState>["onWebRTCIce"];

  onWebRTCMediaState: UseWebRTCPeersArgs<MediaState>["onWebRTCMediaState"];
  onWebRTCSpeaking: UseWebRTCPeersArgs<MediaState>["onWebRTCSpeaking"];
};

export type WebRTCPeersLatestRef<MediaState> = React.MutableRefObject<
  WebRTCPeersLatest<MediaState>
>;
