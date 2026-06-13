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
  // Best-effort socket id of *this* client. Used to recognise our own echo of
  // a sync_video broadcast (server includes it in the receive_sync/room_state
  // payloads as `senderId`) so we can avoid snapping our own timeline back
  // when the server adds round-trip latency.
  socketId?: string | null;
  isConnected: boolean;
  playerRef: React.RefObject<unknown>;
  applyingRemoteSyncRef: React.MutableRefObject<boolean>;
  lastUserPauseAtRef?: React.MutableRefObject<number>;
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
  // Fires when the server drops one of *our* chat messages for exceeding the
  // per-socket rate limit. It's a per-socket signal, so any received event is
  // inherently meant for this client.
  onChatRateLimited?: (
    callback: (data: { roomId: string }) => void,
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
  addReactionFn?: (messageId: string, emoji: string) => void;
  onReactionUpdated?: (
    callback: (data: {
      messageId: string;
      reactions: Record<string, string[]>;
    }) => void,
  ) => (() => void) | undefined;
};
