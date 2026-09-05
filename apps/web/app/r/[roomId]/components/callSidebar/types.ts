import type React from "react";

import type { WebRTCMediaState } from "shared-logic";
import type { DraggedTilePayload } from "../../lib/dnd";
import type {
  MediaDeviceErrors,
  MediaDeviceKind,
  MediaDevicePending,
} from "../../hooks/useMediaTracks";
import type { SelectableMediaDevice } from "../../hooks/useMediaDevices";
import type { PeerConnectionStatus } from "../../hooks";

export type CallSidebarProps = {
  userId: string;
  hostId: string | null;
  onKickUser: (targetId: string) => void;
  participants: string[];
  usernamesById?: Record<string, string | null>;
  hasRoomPassword: boolean;
  onSetRoomPassword: (password: string) => void;
  guestUsername: string | null;
  setGuestUsername: ((name: string) => void) | null;

  localSpeaking: boolean;
  isCallCollapsed: boolean;
  setIsCallCollapsed: React.Dispatch<React.SetStateAction<boolean>>;

  micEnabled: boolean;
  setMicEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  camEnabled: boolean;
  setCamEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  screenEnabled: boolean;
  setScreenEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  mediaErrors: MediaDeviceErrors;
  mediaPending: MediaDevicePending;
  clearMediaError: (kind: MediaDeviceKind) => void;
  audioInputs: SelectableMediaDevice[];
  videoInputs: SelectableMediaDevice[];
  audioOutputs: SelectableMediaDevice[];
  audioInputId: string;
  setAudioInputId: (deviceId: string) => void;
  videoInputId: string;
  setVideoInputId: (deviceId: string) => void;
  audioOutputId: string;
  setAudioOutputId: (deviceId: string) => void;
  outputSelectionSupported: boolean;
  devicesRefreshing: boolean;
  deviceInventoryError: string | null;
  refreshDevices: () => Promise<SelectableMediaDevice[]>;

  pushToTalkEnabled: boolean;
  setPushToTalkEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  pushToTalkDown: boolean;
  pushToTalkBindingLabel: string;
  stopPushToTalkTransmit: () => void;
  closePushToTalkGate: () => void;

  isRebindingPushToTalkKey: boolean;
  setIsRebindingPushToTalkKey: React.Dispatch<React.SetStateAction<boolean>>;

  echoCancellationEnabled: boolean;
  setEchoCancellationEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  noiseSuppressionEnabled: boolean;
  setNoiseSuppressionEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  autoGainControlEnabled: boolean;
  setAutoGainControlEnabled: React.Dispatch<React.SetStateAction<boolean>>;

  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  setLocalVideoElement: React.RefCallback<HTMLVideoElement>;

  remoteStreams: Array<{ id: string; stream: MediaStream }>;
  remoteSpeaking: Record<string, boolean>;
  remoteMedia: Record<string, WebRTCMediaState>;
  peerConnectionStates: Record<string, PeerConnectionStatus>;
  retryFailedPeers: () => Promise<void>;

  setIsDraggingTile: (v: boolean) => void;
  setIsStageDragOver: (v: boolean) => void;
  onPinTile: (payload: DraggedTilePayload) => void;
};
