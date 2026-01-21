import type * as React from "react";

import type { WebRTCMediaState } from "shared-logic";

import type { RemoteStreamEntry } from "../types";
import type { RoomClientViewProps } from "./RoomClientView";

export function buildCallSidebarProps(args: {
  userId: string;
  hostId: string | null;
  onKickUser: (targetId: string) => void;
  participants: string[];
  usernamesById: Record<string, string | null>;
  hasRoomPassword: boolean;
  onSetRoomPassword: (password: string) => void;

  localSpeaking: boolean;
  micEnabled: boolean;
  setMicEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  camEnabled: boolean;
  setCamEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  screenEnabled: boolean;
  setScreenEnabled: React.Dispatch<React.SetStateAction<boolean>>;

  pushToTalkEnabled: boolean;
  setPushToTalkEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  pushToTalkDown: boolean;
  pushToTalkBindingLabel: string;
  stopPushToTalkTransmit: () => void;

  isRebindingPushToTalkKey: boolean;
  setIsRebindingPushToTalkKey: React.Dispatch<React.SetStateAction<boolean>>;

  echoCancellationEnabled: boolean;
  setEchoCancellationEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  noiseSuppressionEnabled: boolean;
  setNoiseSuppressionEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  autoGainControlEnabled: boolean;
  setAutoGainControlEnabled: React.Dispatch<React.SetStateAction<boolean>>;

  localVideoRef: React.RefObject<HTMLVideoElement | null>;

  isCallCollapsed: boolean;
  setIsCallCollapsed: React.Dispatch<React.SetStateAction<boolean>>;

  remoteStreams: RemoteStreamEntry[];
  remoteSpeaking: Record<string, boolean>;
  remoteMedia: Record<string, WebRTCMediaState>;

  setIsDraggingTile: (v: boolean) => void;
  setIsStageDragOver: (v: boolean) => void;
}): RoomClientViewProps["callSidebarProps"] {
  return {
    userId: args.userId,
    hostId: args.hostId,
    onKickUser: args.onKickUser,
    participants: args.participants,
    usernamesById: args.usernamesById,
    hasRoomPassword: args.hasRoomPassword,
    onSetRoomPassword: args.onSetRoomPassword,

    localSpeaking: args.localSpeaking,
    isCallCollapsed: args.isCallCollapsed,
    setIsCallCollapsed: args.setIsCallCollapsed,

    micEnabled: args.micEnabled,
    setMicEnabled: args.setMicEnabled,
    camEnabled: args.camEnabled,
    setCamEnabled: args.setCamEnabled,
    screenEnabled: args.screenEnabled,
    setScreenEnabled: args.setScreenEnabled,

    pushToTalkEnabled: args.pushToTalkEnabled,
    setPushToTalkEnabled: args.setPushToTalkEnabled,
    pushToTalkDown: args.pushToTalkDown,
    pushToTalkBindingLabel: args.pushToTalkBindingLabel,
    stopPushToTalkTransmit: args.stopPushToTalkTransmit,

    isRebindingPushToTalkKey: args.isRebindingPushToTalkKey,
    setIsRebindingPushToTalkKey: args.setIsRebindingPushToTalkKey,

    echoCancellationEnabled: args.echoCancellationEnabled,
    setEchoCancellationEnabled: args.setEchoCancellationEnabled,
    noiseSuppressionEnabled: args.noiseSuppressionEnabled,
    setNoiseSuppressionEnabled: args.setNoiseSuppressionEnabled,
    autoGainControlEnabled: args.autoGainControlEnabled,
    setAutoGainControlEnabled: args.setAutoGainControlEnabled,

    localVideoRef: args.localVideoRef,

    remoteStreams: args.remoteStreams,
    remoteSpeaking: args.remoteSpeaking,
    remoteMedia: args.remoteMedia,

    setIsDraggingTile: args.setIsDraggingTile,
    setIsStageDragOver: args.setIsStageDragOver,
  };
}
