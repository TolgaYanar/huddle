// Playlist types for room-based video playlists

export interface PlaylistItem {
  id: string;
  videoUrl: string;
  title: string;
  addedBy: string;
  addedByUsername?: string | null;
  addedAt: number;
  duration?: number;
  thumbnail?: string;
}

export interface Playlist {
  id: string;
  roomId: string;
  name: string;
  description?: string;
  items: PlaylistItem[];
  createdBy: string;
  createdByUsername?: string | null;
  createdAt: number;
  updatedAt: number;
  isDefault?: boolean;
  settings: PlaylistSettings;
}

export interface PlaylistSettings {
  loop: boolean;
  shuffle: boolean;
  autoPlay: boolean;
}

export interface PlaylistStateData {
  roomId: string;
  playlists: Playlist[];
  activePlaylistId?: string | null;
  currentItemIndex?: number;
}

export interface PlaylistCreateData {
  roomId: string;
  name: string;
  description?: string;
  settings?: Partial<PlaylistSettings>;
}

export interface PlaylistUpdateData {
  roomId: string;
  playlistId: string;
  name?: string;
  description?: string;
  settings?: Partial<PlaylistSettings>;
}

export interface PlaylistAddItemData {
  roomId: string;
  playlistId: string;
  videoUrl: string;
  title: string;
  duration?: number;
  thumbnail?: string;
}

export interface PlaylistRemoveItemData {
  roomId: string;
  playlistId: string;
  itemId: string;
}

export interface PlaylistReorderItemsData {
  roomId: string;
  playlistId: string;
  itemIds: string[];
}

export interface PlaylistDeleteData {
  roomId: string;
  playlistId: string;
}

export interface PlaylistPlayItemData {
  roomId: string;
  playlistId: string;
  itemId: string;
}

export interface PlaylistSetActiveData {
  roomId: string;
  playlistId: string | null;
}

export const DEFAULT_PLAYLIST_SETTINGS: PlaylistSettings = {
  loop: false,
  shuffle: false,
  autoPlay: true,
};
