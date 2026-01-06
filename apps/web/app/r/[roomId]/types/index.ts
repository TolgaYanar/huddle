import type { WebRTCMediaState, WheelSpunData } from "shared-logic";

export type LogEntry = {
  id?: string;
  msg: string;
  type: string;
  time: string;
  user: string;
};

export type RemoteStreamEntry = {
  id: string;
  stream: MediaStream;
};

export type StageView = {
  id: string;
  stream: MediaStream;
  isLocal: boolean;
  pinned: boolean;
};

export type RemoteForPlayer = {
  id: string;
  stream: MediaStream;
  media?: WebRTCMediaState;
};

export type FullscreenChatMessage = {
  msg: string;
  time: string;
  user: string;
};

// Re-export from lib to keep all types centralized
export type { VideoPreview } from "../lib/video-preview";
export type { WebRTCMediaState, WheelSpunData };

// Re-export playlist types
export type {
  PlaylistItem,
  Playlist,
  PlaylistSettings,
  PlaylistStateData,
  PlaylistCreateData,
  PlaylistUpdateData,
  PlaylistAddItemData,
  PlaylistRemoveItemData,
  PlaylistReorderItemsData,
  PlaylistDeleteData,
  PlaylistPlayItemData,
  PlaylistSetActiveData,
} from "./playlist";
export { DEFAULT_PLAYLIST_SETTINGS } from "./playlist";
