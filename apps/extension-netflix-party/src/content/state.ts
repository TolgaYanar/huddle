import type { Socket } from "socket.io-client";

import type { ChatMessage, RoomState } from "./types";

export type OverlayElements = {
  status: HTMLSpanElement;
  room: HTMLSpanElement;
  drift: HTMLSpanElement;
  hint: HTMLDivElement;
  collapse: HTMLButtonElement;
  panel: HTMLDivElement;
  chatList: HTMLDivElement;
  chatInput: HTMLTextAreaElement;
  chatSend: HTMLButtonElement;
};

export type WatchIdMismatch = { expected: string; actual: string };

export type ContentState = {
  socket: Socket | null;
  currentRoomId: string | null;
  isApplyingRemote: boolean;
  lastAppliedRev: number;

  localSenderId: string | null;
  lastConnectionError: string | null;

  lastWatchIdMismatch: WatchIdMismatch | null;

  hasUserGesture: boolean;
  lastUserGestureAt: number;
  lastRemoteApplyAt: number;
  lastRemoteAction: string | null;
  lastRemoteTimestamp: number | null;

  playPausePollTimer: number | null;
  lastLocalPaused: boolean | null;

  pendingRoomState: RoomState | null;
  pendingDriftSeconds: number | null;

  pendingPlayOnGesture: boolean;
  lastCatchUpNote: string | null;

  chatMessages: ChatMessage[];
  lastRenderedChatSignature: string;

  overlayRoot: HTMLDivElement | null;
  overlayShadow: ShadowRoot | null;
  overlayEls: OverlayElements | null;

  listenersAttachedTo: HTMLVideoElement | null;
};

export function createInitialState(): ContentState {
  return {
    socket: null,
    currentRoomId: null,
    isApplyingRemote: false,
    lastAppliedRev: 0,

    localSenderId: null,
    lastConnectionError: null,

    lastWatchIdMismatch: null,

    hasUserGesture: false,
    lastUserGestureAt: 0,
    lastRemoteApplyAt: 0,
    lastRemoteAction: null,
    lastRemoteTimestamp: null,

    playPausePollTimer: null,
    lastLocalPaused: null,

    pendingRoomState: null,
    pendingDriftSeconds: null,

    pendingPlayOnGesture: false,
    lastCatchUpNote: null,

    chatMessages: [],
    lastRenderedChatSignature: "",

    overlayRoot: null,
    overlayShadow: null,
    overlayEls: null,

    listenersAttachedTo: null,
  };
}
