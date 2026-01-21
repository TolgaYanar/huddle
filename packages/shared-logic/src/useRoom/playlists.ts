import { useCallback } from "react";
import type { MutableRefObject } from "react";
import type { Socket } from "socket.io-client";

import type {
  PlaylistItemPlayedData,
  PlaylistSettings,
  PlaylistStateData,
} from "../types";

export function usePlaylistsApi({
  roomId,
  socketRef,
  latestPlaylistStateRef,
}: {
  roomId: string;
  socketRef: MutableRefObject<Socket | null>;
  latestPlaylistStateRef: MutableRefObject<PlaylistStateData | null>;
}) {
  const requestPlaylistState = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    if (!socket.connected) return;
    socket.emit("playlist_get", { roomId });
  }, [roomId, socketRef]);

  const createPlaylist = useCallback(
    (
      name: string,
      description?: string,
      settings?: Partial<PlaylistSettings>,
    ) => {
      const socket = socketRef.current;
      if (!socket) return;
      if (!socket.connected) return;
      socket.emit("playlist_create", { roomId, name, description, settings });
    },
    [roomId, socketRef],
  );

  const updatePlaylist = useCallback(
    (
      playlistId: string,
      updates: {
        name?: string;
        description?: string;
        settings?: Partial<PlaylistSettings>;
      },
    ) => {
      const socket = socketRef.current;
      if (!socket) return;
      if (!socket.connected) return;
      socket.emit("playlist_update", { roomId, playlistId, ...updates });
    },
    [roomId, socketRef],
  );

  const deletePlaylist = useCallback(
    (playlistId: string) => {
      const socket = socketRef.current;
      if (!socket) return;
      if (!socket.connected) return;
      socket.emit("playlist_delete", { roomId, playlistId });
    },
    [roomId, socketRef],
  );

  const addPlaylistItem = useCallback(
    (
      playlistId: string,
      videoUrl: string,
      title: string,
      duration?: number,
      thumbnail?: string,
    ) => {
      const socket = socketRef.current;
      if (!socket) return;
      if (!socket.connected) return;
      socket.emit("playlist_add_item", {
        roomId,
        playlistId,
        videoUrl,
        title,
        duration,
        thumbnail,
      });
    },
    [roomId, socketRef],
  );

  const removePlaylistItem = useCallback(
    (playlistId: string, itemId: string) => {
      const socket = socketRef.current;
      if (!socket) return;
      if (!socket.connected) return;
      socket.emit("playlist_remove_item", { roomId, playlistId, itemId });
    },
    [roomId, socketRef],
  );

  const reorderPlaylistItems = useCallback(
    (playlistId: string, itemIds: string[]) => {
      const socket = socketRef.current;
      if (!socket) return;
      if (!socket.connected) return;
      socket.emit("playlist_reorder_items", { roomId, playlistId, itemIds });
    },
    [roomId, socketRef],
  );

  const setActivePlaylist = useCallback(
    (playlistId: string | null) => {
      const socket = socketRef.current;
      if (!socket) return;
      if (!socket.connected) return;
      socket.emit("playlist_set_active", { roomId, playlistId });
    },
    [roomId, socketRef],
  );

  const playPlaylistItem = useCallback(
    (playlistId: string, itemId: string) => {
      const socket = socketRef.current;
      if (!socket) return;
      if (!socket.connected) return;
      socket.emit("playlist_play_item", { roomId, playlistId, itemId });
    },
    [roomId, socketRef],
  );

  const playNextInPlaylist = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    if (!socket.connected) return;
    socket.emit("playlist_next", { roomId });
  }, [roomId, socketRef]);

  const playPreviousInPlaylist = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    if (!socket.connected) return;
    socket.emit("playlist_previous", { roomId });
  }, [roomId, socketRef]);

  const onPlaylistState = useCallback(
    (callback: (data: PlaylistStateData) => void) => {
      if (socketRef.current) {
        socketRef.current.on("playlist_state", callback);
      }

      const cached = latestPlaylistStateRef.current;
      if (cached && cached.roomId === roomId) {
        callback(cached);
      }

      return () => {
        if (socketRef.current) {
          socketRef.current.off("playlist_state", callback);
        }
      };
    },
    [latestPlaylistStateRef, roomId, socketRef],
  );

  const onPlaylistItemPlayed = useCallback(
    (callback: (data: PlaylistItemPlayedData) => void) => {
      if (socketRef.current) {
        socketRef.current.on("playlist_item_played", callback);
      }
      return () => {
        if (socketRef.current) {
          socketRef.current.off("playlist_item_played", callback);
        }
      };
    },
    [socketRef],
  );

  return {
    requestPlaylistState,
    createPlaylist,
    updatePlaylist,
    deletePlaylist,
    addPlaylistItem,
    removePlaylistItem,
    reorderPlaylistItems,
    setActivePlaylist,
    playPlaylistItem,
    playNextInPlaylist,
    playPreviousInPlaylist,
    onPlaylistState,
    onPlaylistItemPlayed,
  };
}
