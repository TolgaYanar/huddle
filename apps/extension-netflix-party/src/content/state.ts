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

  // Tracks our own outbound sync_video emits. Used by applyRoomStateToVideo
  // to recognise the room_state echo that fires shortly after a local seek/
  // play/pause, and skip the drift correction so the user's gesture isn't
  // pulled back to a slightly stale snapshot value.
  lastLocalEmitAt: number;
  lastLocalEmitAction: string | null;
  lastLocalEmitTimestamp: number | null;

  // Last URL we auto-navigated to in response to a room watch-id mismatch.
  // Used to avoid re-navigation loops if applyRoomStateToVideo fires
  // multiple times during the brief window before the new page loads.
  lastAutoNavigatedTo: string | null;
  lastAutoNavigatedAt: number;

  // True once we've successfully applied at least one room_state since the
  // current socket connected. Drives the "follow vs lead" decision when the
  // content script starts on a /watch/<X> page that differs from what the
  // server currently thinks the room is watching:
  //   - First mismatch (this flag still false) -> WE'RE the source of truth;
  //     broadcast change_url so the room follows us. This is the user-
  //     navigated-to-new-content case.
  //   - Subsequent mismatch (flag true) -> the ROOM moved while we were
  //     watching (e.g. host clicked Next Episode); auto-navigate to follow.
  hasAppliedRoomStateSinceConnect: boolean;

  // Room membership snapshot from the server's room_users event. Used to
  // populate the popup's "X people watching together" indicator.
  roomMembers: Array<{ socketId: string; username: string | null }>;
  hostId: string | null;

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

    lastLocalEmitAt: 0,
    lastLocalEmitAction: null,
    lastLocalEmitTimestamp: null,

    lastAutoNavigatedTo: null,
    lastAutoNavigatedAt: 0,

    hasAppliedRoomStateSinceConnect: false,

    roomMembers: [],
    hostId: null,

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
