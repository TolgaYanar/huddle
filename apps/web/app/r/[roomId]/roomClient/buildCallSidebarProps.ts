import type * as React from "react";

import type { WebRTCMediaState } from "shared-logic";

import type { RemoteStreamEntry } from "../types";
import type { DraggedTilePayload } from "../lib/dnd";
import type { RoomClientViewProps } from "./RoomClientView";
import type {
  MediaDeviceErrors,
  MediaDeviceKind,
  MediaDevicePending,
} from "../hooks/useMediaTracks";
import type { SelectableMediaDevice } from "../hooks/useMediaDevices";
import type { PeerConnectionStatus } from "../hooks";

export function buildCallSidebarProps(args: {
  userId: string;
  hostId: string | null;
  onKickUser: (targetId: string) => void;
  participants: string[];
  usernamesById: Record<string, string | null>;
  hasRoomPassword: boolean;
  onSetRoomPassword: (password: string) => void;
  guestUsername: string | null;
  setGuestUsername: ((name: string) => void) | null;

  localSpeaking: boolean;
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

  isCallCollapsed: boolean;
  setIsCallCollapsed: React.Dispatch<React.SetStateAction<boolean>>;

  remoteStreams: RemoteStreamEntry[];
  remoteSpeaking: Record<string, boolean>;
  remoteMedia: Record<string, WebRTCMediaState>;
  peerConnectionStates: Record<string, PeerConnectionStatus>;
  retryFailedPeers: () => Promise<void>;

  setIsDraggingTile: (v: boolean) => void;
  setIsStageDragOver: (v: boolean) => void;
  onPinTile: (payload: DraggedTilePayload) => void;
}): RoomClientViewProps["callSidebarProps"] {
  return {
    userId: args.userId,
    hostId: args.hostId,
    onKickUser: args.onKickUser,
    participants: args.participants,
    usernamesById: args.usernamesById,
    hasRoomPassword: args.hasRoomPassword,
    onSetRoomPassword: args.onSetRoomPassword,
    guestUsername: args.guestUsername,
    setGuestUsername: args.setGuestUsername,

    localSpeaking: args.localSpeaking,
    isCallCollapsed: args.isCallCollapsed,
    setIsCallCollapsed: args.setIsCallCollapsed,

    micEnabled: args.micEnabled,
    setMicEnabled: args.setMicEnabled,
    camEnabled: args.camEnabled,
    setCamEnabled: args.setCamEnabled,
    screenEnabled: args.screenEnabled,
    setScreenEnabled: args.setScreenEnabled,
    mediaErrors: args.mediaErrors,
    mediaPending: args.mediaPending,
    clearMediaError: args.clearMediaError,
    audioInputs: args.audioInputs,
    videoInputs: args.videoInputs,
    audioOutputs: args.audioOutputs,
    audioInputId: args.audioInputId,
    setAudioInputId: args.setAudioInputId,
    videoInputId: args.videoInputId,
    setVideoInputId: args.setVideoInputId,
    audioOutputId: args.audioOutputId,
    setAudioOutputId: args.setAudioOutputId,
    outputSelectionSupported: args.outputSelectionSupported,
    devicesRefreshing: args.devicesRefreshing,
    deviceInventoryError: args.deviceInventoryError,
    refreshDevices: args.refreshDevices,

    pushToTalkEnabled: args.pushToTalkEnabled,
    setPushToTalkEnabled: args.setPushToTalkEnabled,
    pushToTalkDown: args.pushToTalkDown,
    pushToTalkBindingLabel: args.pushToTalkBindingLabel,
    stopPushToTalkTransmit: args.stopPushToTalkTransmit,
    closePushToTalkGate: args.closePushToTalkGate,

    isRebindingPushToTalkKey: args.isRebindingPushToTalkKey,
    setIsRebindingPushToTalkKey: args.setIsRebindingPushToTalkKey,

    echoCancellationEnabled: args.echoCancellationEnabled,
    setEchoCancellationEnabled: args.setEchoCancellationEnabled,
    noiseSuppressionEnabled: args.noiseSuppressionEnabled,
    setNoiseSuppressionEnabled: args.setNoiseSuppressionEnabled,
    autoGainControlEnabled: args.autoGainControlEnabled,
    setAutoGainControlEnabled: args.setAutoGainControlEnabled,

    localVideoRef: args.localVideoRef,
    setLocalVideoElement: args.setLocalVideoElement,

    remoteStreams: args.remoteStreams,
    remoteSpeaking: args.remoteSpeaking,
    remoteMedia: args.remoteMedia,
    peerConnectionStates: args.peerConnectionStates,
    retryFailedPeers: args.retryFailedPeers,

    setIsDraggingTile: args.setIsDraggingTile,
    setIsStageDragOver: args.setIsStageDragOver,
    onPinTile: args.onPinTile,
  };
}
