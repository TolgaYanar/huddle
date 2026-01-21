import type React from "react";

import type { WebRTCMediaState } from "shared-logic";

export type CallSidebarProps = {
  userId: string;
  hostId: string | null;
  onKickUser: (targetId: string) => void;
  participants: string[];
  usernamesById?: Record<string, string | null>;
  hasRoomPassword: boolean;
  onSetRoomPassword: (password: string) => void;

  localSpeaking: boolean;
  isCallCollapsed: boolean;
  setIsCallCollapsed: React.Dispatch<React.SetStateAction<boolean>>;

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

  remoteStreams: Array<{ id: string; stream: MediaStream }>;
  remoteSpeaking: Record<string, boolean>;
  remoteMedia: Record<string, WebRTCMediaState>;

  setIsDraggingTile: (v: boolean) => void;
  setIsStageDragOver: (v: boolean) => void;
};
