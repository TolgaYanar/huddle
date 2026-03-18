const { emitPlaylistStateToRoom } = require("../helpers/playlists");
const { applyPlaylistPlaybackToRoomState } = require("../helpers/sync");

function attachPlaylistPlaybackHandlers(io, state, socket, deps) {
  socket.on("playlist_play_item", async (data) => {
    const { roomId, playlistId, itemId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!playlistId || typeof playlistId !== "string") return;
    if (!itemId || typeof itemId !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    if (!deps.isDbConnected() || !deps.getPrisma()) return;

    try {
      // Get the playlist with items
      const playlist = await deps.getPrisma().roomPlaylist.findUnique({
        where: { id: playlistId },
        include: {
          items: {
            orderBy: { position: "asc" },
          },
        },
      });

      if (!playlist || playlist.roomId !== roomId) return;

      const itemIndex = playlist.items.findIndex((item) => item.id === itemId);
      if (itemIndex === -1) return;

      const item = playlist.items[itemIndex];

      // Update active state
      state.roomPlaylistActive.set(roomId, {
        activePlaylistId: playlistId,
        currentItemIndex: itemIndex,
      });

      // Emit playlist item played event to change the video
      io.to(roomId).emit("playlist_item_played", {
        roomId,
        playlistId,
        itemId: item.id,
        itemIndex,
        videoUrl: item.videoUrl,
        title: item.title,
      });

      // Also update authoritative room sync state.
      applyPlaylistPlaybackToRoomState(io, state, roomId, item.videoUrl);

      await emitPlaylistStateToRoom(deps, state, io, roomId);
    } catch (err) {
      console.error("Failed to play playlist item:", err.message);
    }
  });

  socket.on("playlist_next", async (data) => {
    const { roomId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    if (!deps.isDbConnected() || !deps.getPrisma()) return;

    const activeState = state.roomPlaylistActive.get(roomId);
    if (!activeState || !activeState.activePlaylistId) return;

    try {
      const playlist = await deps.getPrisma().roomPlaylist.findUnique({
        where: { id: activeState.activePlaylistId },
        include: {
          items: {
            orderBy: { position: "asc" },
          },
        },
      });

      if (!playlist || playlist.items.length === 0) return;

      let nextIndex = activeState.currentItemIndex + 1;

      // Handle loop/end of playlist
      if (nextIndex >= playlist.items.length) {
        if (playlist.loop) {
          nextIndex = 0;
        } else {
          return;
        }
      }

      // Handle shuffle
      if (playlist.shuffle && playlist.items.length > 1) {
        let candidate = nextIndex;
        for (let i = 0; i < 5; i++) {
          const r = Math.floor(Math.random() * playlist.items.length);
          if (r !== activeState.currentItemIndex) {
            candidate = r;
            break;
          }
        }
        if (candidate === activeState.currentItemIndex) {
          candidate =
            (activeState.currentItemIndex + 1) % playlist.items.length;
        }
        nextIndex = candidate;
      } else if (playlist.shuffle) {
        nextIndex = Math.floor(Math.random() * playlist.items.length);
      }

      const item = playlist.items[nextIndex];

      // Guard against concurrent playlist_next from multiple clients (e.g. video-ended
      // fires on every client simultaneously). If another handler already advanced the
      // index while we were awaiting the DB query, bail out to avoid double-advancing.
      const freshActiveState = state.roomPlaylistActive.get(roomId);
      if (freshActiveState?.currentItemIndex !== activeState.currentItemIndex) {
        return;
      }

      state.roomPlaylistActive.set(roomId, {
        activePlaylistId: playlist.id,
        currentItemIndex: nextIndex,
      });

      io.to(roomId).emit("playlist_item_played", {
        roomId,
        playlistId: playlist.id,
        itemId: item.id,
        itemIndex: nextIndex,
        videoUrl: item.videoUrl,
        title: item.title,
      });

      applyPlaylistPlaybackToRoomState(io, state, roomId, item.videoUrl);

      await emitPlaylistStateToRoom(deps, state, io, roomId);
    } catch (err) {
      console.error("Failed to play next playlist item:", err.message);
    }
  });

  socket.on("playlist_previous", async (data) => {
    const { roomId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    if (!deps.isDbConnected() || !deps.getPrisma()) return;

    const activeState = state.roomPlaylistActive.get(roomId);
    if (!activeState || !activeState.activePlaylistId) return;

    try {
      const playlist = await deps.getPrisma().roomPlaylist.findUnique({
        where: { id: activeState.activePlaylistId },
        include: {
          items: {
            orderBy: { position: "asc" },
          },
        },
      });

      if (!playlist || playlist.items.length === 0) return;

      let prevIndex = activeState.currentItemIndex - 1;

      if (prevIndex < 0) {
        if (playlist.loop) {
          prevIndex = playlist.items.length - 1;
        } else {
          prevIndex = 0;
        }
      }

      const item = playlist.items[prevIndex];

      // Same concurrent-advance guard as playlist_next.
      const freshActiveState = state.roomPlaylistActive.get(roomId);
      if (freshActiveState?.currentItemIndex !== activeState.currentItemIndex) {
        return;
      }

      state.roomPlaylistActive.set(roomId, {
        activePlaylistId: playlist.id,
        currentItemIndex: prevIndex,
      });

      io.to(roomId).emit("playlist_item_played", {
        roomId,
        playlistId: playlist.id,
        itemId: item.id,
        itemIndex: prevIndex,
        videoUrl: item.videoUrl,
        title: item.title,
      });

      applyPlaylistPlaybackToRoomState(io, state, roomId, item.videoUrl);

      await emitPlaylistStateToRoom(deps, state, io, roomId);
    } catch (err) {
      console.error("Failed to play previous playlist item:", err.message);
    }
  });
}

module.exports = {
  attachPlaylistPlaybackHandlers,
};
