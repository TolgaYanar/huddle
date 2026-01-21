import type { UserPresenceData } from "shared-logic";

export type RemoteStreamsState = Array<{ id: string; stream: MediaStream }>;

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

  createPeerConnection: (peerId: string) => RTCPeerConnection;
  sendOfferToPeer: (peerId: string) => Promise<void>;
  closePeer: (peerId: string) => void;
  syncTracksToPeer: (peerId: string, pc: RTCPeerConnection) => void;

  sendWebRTCAnswer: (to: string, sdp: RTCSessionDescriptionInit | null) => void;
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
