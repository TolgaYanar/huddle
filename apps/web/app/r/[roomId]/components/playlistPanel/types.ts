import type * as React from "react";

import type { Playlist, PlaylistItem, PlaylistSettings } from "shared-logic";

export interface PlaylistPanelProps {
  playlists: Playlist[];
  activePlaylistId: string | null;
  currentItemIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onCreatePlaylist: (
    name: string,
    description?: string,
    settings?: Partial<PlaylistSettings>,
  ) => void;
  onUpdatePlaylist: (
    playlistId: string,
    updates: {
      name?: string;
      description?: string;
      settings?: Partial<PlaylistSettings>;
    },
  ) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onRemoveItem: (playlistId: string, itemId: string) => void;
  onReorderItems: (playlistId: string, itemIds: string[]) => void;
  onSetActive: (playlistId: string | null) => void;
  onPlayItem: (playlistId: string, itemId: string) => void;
  onPlayNext: () => void;
  onPlayPrevious: () => void;
  onAddCurrentVideo?: () => void;
  onOpenAddVideos?: () => void;
  currentVideoUrl?: string;
}

export interface CreatePlaylistFormProps {
  onSubmit: (name: string, description?: string) => void;
  onCancel: () => void;
}

export interface PlaylistSettingsFormProps {
  playlist: Playlist;
  onUpdate: (updates: {
    settings?: Partial<PlaylistSettings>;
    name?: string;
    description?: string;
  }) => void;
  onDelete: () => void;
  onClose: () => void;
}

export interface PlaylistItemRowProps {
  item: PlaylistItem;
  index: number;
  isActive: boolean;
  isPlaying: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  onPlay: () => void;
  onRemove: () => void;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  onDrop: (index: number) => void;
}
