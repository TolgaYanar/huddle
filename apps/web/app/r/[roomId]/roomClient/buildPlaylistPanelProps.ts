import type { usePlaylist } from "../hooks/usePlaylist";

import type { RoomClientViewProps } from "./RoomClientView";

type Playlist = ReturnType<typeof usePlaylist>;

export function buildPlaylistPanelProps(args: {
  playlist: Playlist;
  currentVideoUrl: string | null;
  onOpenAddVideos: () => void;
  onAddCurrentVideo: (() => void) | undefined;
}): RoomClientViewProps["playlistPanelProps"] {
  const { playlist, currentVideoUrl, onOpenAddVideos, onAddCurrentVideo } =
    args;

  return {
    playlists: playlist.playlists,
    activePlaylistId: playlist.activePlaylistId,
    currentItemIndex: playlist.currentItemIndex,
    isOpen: playlist.isPlaylistPanelOpen,
    onClose: () => playlist.setIsPlaylistPanelOpen(false),
    onCreatePlaylist: playlist.createPlaylist,
    onUpdatePlaylist: playlist.updatePlaylist,
    onDeletePlaylist: playlist.deletePlaylist,
    onRemoveItem: playlist.removeItem,
    onReorderItems: playlist.reorderItems,
    onSetActive: playlist.setActive,
    onPlayItem: playlist.playItem,
    onPlayNext: playlist.playNext,
    onPlayPrevious: playlist.playPrevious,
    onAddCurrentVideo,
    onOpenAddVideos,
    currentVideoUrl: currentVideoUrl ?? undefined,
  };
}
