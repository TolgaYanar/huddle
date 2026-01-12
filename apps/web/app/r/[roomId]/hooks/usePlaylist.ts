"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  Playlist,
  PlaylistItem,
  PlaylistStateData,
  PlaylistItemPlayedData,
  PlaylistSettings,
} from "shared-logic";

interface UsePlaylistProps {
  roomId: string;
  onPlaylistState: (callback: (data: PlaylistStateData) => void) => () => void;
  onPlaylistItemPlayed: (
    callback: (data: PlaylistItemPlayedData) => void
  ) => () => void;
  requestPlaylistState: () => void;
  createPlaylist: (
    name: string,
    description?: string,
    settings?: Partial<PlaylistSettings>
  ) => void;
  updatePlaylist: (
    playlistId: string,
    updates: {
      name?: string;
      description?: string;
      settings?: Partial<PlaylistSettings>;
    }
  ) => void;
  deletePlaylist: (playlistId: string) => void;
  addPlaylistItem: (
    playlistId: string,
    videoUrl: string,
    title: string,
    duration?: number,
    thumbnail?: string
  ) => void;
  removePlaylistItem: (playlistId: string, itemId: string) => void;
  reorderPlaylistItems: (playlistId: string, itemIds: string[]) => void;
  setActivePlaylist: (playlistId: string | null) => void;
  playPlaylistItem: (playlistId: string, itemId: string) => void;
  playNextInPlaylist: () => void;
  playPreviousInPlaylist: () => void;
  onVideoEnded?: () => void;
  loadVideoUrl?: (
    url: string,
    options?: { forcePlay?: boolean; skipBroadcast?: boolean }
  ) => void;
}

export function usePlaylist({
  roomId,
  onPlaylistState,
  onPlaylistItemPlayed,
  requestPlaylistState,
  createPlaylist: createPlaylistFn,
  updatePlaylist: updatePlaylistFn,
  deletePlaylist: deletePlaylistFn,
  addPlaylistItem: addPlaylistItemFn,
  removePlaylistItem: removePlaylistItemFn,
  reorderPlaylistItems: reorderPlaylistItemsFn,
  setActivePlaylist: setActivePlaylistFn,
  playPlaylistItem: playPlaylistItemFn,
  playNextInPlaylist,
  playPreviousInPlaylist,
  loadVideoUrl,
}: UsePlaylistProps) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [isPlaylistPanelOpen, setIsPlaylistPanelOpen] = useState(false);
  const [isAddToPlaylistOpen, setIsAddToPlaylistOpen] = useState(false);
  const [pendingVideoUrl, setPendingVideoUrl] = useState<string | null>(null);

  // Request playlist state on mount
  useEffect(() => {
    requestPlaylistState();
  }, [requestPlaylistState]);

  // Listen for playlist state updates
  useEffect(() => {
    const cleanup = onPlaylistState((data: PlaylistStateData) => {
      if (data.roomId !== roomId) return;
      setPlaylists(data.playlists);
      setActivePlaylistId(data.activePlaylistId ?? null);
      setCurrentItemIndex(data.currentItemIndex ?? 0);
    });
    return cleanup;
  }, [roomId, onPlaylistState]);

  // Listen for playlist item played events
  useEffect(() => {
    const cleanup = onPlaylistItemPlayed((data: PlaylistItemPlayedData) => {
      if (data.roomId !== roomId) return;
      // Playback is driven by server sync events (receive_sync change_url/play)
      // so we do NOT call loadVideoUrl here by default. Calling both can cause
      // repeated reload/restart loops (especially with YouTube).
      //
      // If you need the legacy behavior for debugging, enable it:
      // localStorage.setItem("huddle:legacyPlaylistPlayback", "1")
      if (!loadVideoUrl) return;
      try {
        if (
          window.localStorage.getItem("huddle:legacyPlaylistPlayback") !== "1"
        ) {
          return;
        }
      } catch {
        return;
      }

      // Legacy behavior: Force play and skip broadcast - all clients receive
      // this event, so we don't want each one to broadcast sync events.
      loadVideoUrl(data.videoUrl, { forcePlay: true, skipBroadcast: true });
    });
    return cleanup;
  }, [roomId, onPlaylistItemPlayed, loadVideoUrl]);

  const createPlaylist = useCallback(
    (
      name: string,
      description?: string,
      settings?: Partial<PlaylistSettings>
    ) => {
      createPlaylistFn(name, description, settings);
    },
    [createPlaylistFn]
  );

  const updatePlaylist = useCallback(
    (
      playlistId: string,
      updates: {
        name?: string;
        description?: string;
        settings?: Partial<PlaylistSettings>;
      }
    ) => {
      updatePlaylistFn(playlistId, updates);
    },
    [updatePlaylistFn]
  );

  const deletePlaylist = useCallback(
    (playlistId: string) => {
      deletePlaylistFn(playlistId);
    },
    [deletePlaylistFn]
  );

  const addItem = useCallback(
    (
      playlistId: string,
      videoUrl: string,
      title: string,
      duration?: number,
      thumbnail?: string
    ) => {
      addPlaylistItemFn(playlistId, videoUrl, title, duration, thumbnail);
    },
    [addPlaylistItemFn]
  );

  const removeItem = useCallback(
    (playlistId: string, itemId: string) => {
      // Optimistic update - remove from local state immediately
      setPlaylists((prev) =>
        prev.map((p) =>
          p.id === playlistId
            ? { ...p, items: p.items.filter((item) => item.id !== itemId) }
            : p
        )
      );
      removePlaylistItemFn(playlistId, itemId);
    },
    [removePlaylistItemFn]
  );

  const reorderItems = useCallback(
    (playlistId: string, itemIds: string[]) => {
      // Optimistic update - reorder in local state immediately for instant feedback
      setPlaylists((prev) =>
        prev.map((p) => {
          if (p.id !== playlistId) return p;

          // Create a map for quick lookup
          const itemMap = new Map(p.items.map((item) => [item.id, item]));

          // Reorder items based on new order
          const reorderedItems = itemIds
            .map((id) => itemMap.get(id))
            .filter((item): item is PlaylistItem => item !== undefined);

          return { ...p, items: reorderedItems };
        })
      );

      // Send to server (will confirm or rollback)
      reorderPlaylistItemsFn(playlistId, itemIds);
    },
    [reorderPlaylistItemsFn]
  );

  const setActive = useCallback(
    (playlistId: string | null) => {
      setActivePlaylistFn(playlistId);
    },
    [setActivePlaylistFn]
  );

  const playItem = useCallback(
    (playlistId: string, itemId: string) => {
      playPlaylistItemFn(playlistId, itemId);
    },
    [playPlaylistItemFn]
  );

  const openAddToPlaylist = useCallback((videoUrl: string) => {
    setPendingVideoUrl(videoUrl);
    setIsAddToPlaylistOpen(true);
  }, []);

  const closeAddToPlaylist = useCallback(() => {
    setIsAddToPlaylistOpen(false);
    setPendingVideoUrl(null);
  }, []);

  const activePlaylist =
    playlists.find((p) => p.id === activePlaylistId) ?? null;
  const currentItem = activePlaylist?.items[currentItemIndex] ?? null;

  return {
    playlists,
    activePlaylistId,
    activePlaylist,
    currentItemIndex,
    currentItem,
    isPlaylistPanelOpen,
    setIsPlaylistPanelOpen,
    isAddToPlaylistOpen,
    pendingVideoUrl,
    openAddToPlaylist,
    closeAddToPlaylist,
    createPlaylist,
    updatePlaylist,
    deletePlaylist,
    addItem,
    removeItem,
    reorderItems,
    setActive,
    playItem,
    playNext: playNextInPlaylist,
    playPrevious: playPreviousInPlaylist,
  };
}
