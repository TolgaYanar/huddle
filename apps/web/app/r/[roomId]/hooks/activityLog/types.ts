import type * as React from "react";

import type {
  ActivityEvent,
  ActivityHistoryData,
  ChatHistoryData,
  ChatMessage,
  RoomStateData,
  SyncData,
} from "shared-logic";

export type RoomPlaybackAnchor = {
  url: string;
  isPlaying: boolean;
  anchorTime: number;
  anchorAt: number;
  playbackRate: number;
};

export type UseActivityLogProps = {
  roomId: string;
  userId: string;
  isConnected: boolean;
  playerRef: React.RefObject<unknown>;
  applyingRemoteSyncRef: React.MutableRefObject<boolean>;
  hasInitialSyncRef?: React.MutableRefObject<boolean>;
  roomPlaybackAnchorRef?: React.MutableRefObject<RoomPlaybackAnchor | null>;
  onRoomPlaybackAnchorUpdated?: (next: RoomPlaybackAnchor) => void;
  setUrl: (url: string) => void;
  setInputUrl: (url: string) => void;
  setVideoState: (state: string) => void;
  setMuted: (muted: boolean) => void;
  setVolume: (volume: number) => void;
  setPlaybackRate: (rate: number) => void;
  setAudioSyncEnabled: (enabled: boolean) => void;
  setPlayerReady: (ready: boolean) => void;
  setPlayerError: (error: string | null) => void;
  onSyncEvent: (callback: (data: SyncData) => void) => () => void;
  onRoomState?: (
    callback: (state: RoomStateData) => void,
  ) => (() => void) | undefined;
  onChatHistory?: (
    callback: (data: ChatHistoryData) => void,
  ) => (() => void) | undefined;
  onChatMessage?: (
    callback: (m: ChatMessage) => void,
  ) => (() => void) | undefined;
  onActivityHistory?: (
    callback: (data: ActivityHistoryData) => void,
  ) => (() => void) | undefined;
  onActivityEvent?: (
    callback: (e: ActivityEvent) => void,
  ) => (() => void) | undefined;
  requestRoomState?: () => void;
  requestChatHistory?: () => void;
  requestActivityHistory?: () => void;
  sendChatMessage?: (text: string) => void;
};
