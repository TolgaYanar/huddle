const { emitPlaylistStateToRoom } = require("../helpers/playlists");

function attachPlaylistItemHandlers(io, state, socket, deps) {
  socket.on("playlist_add_item", async (data) => {
    const { roomId, playlistId, videoUrl, title, duration, thumbnail } =
      data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!playlistId || typeof playlistId !== "string") return;
    if (!videoUrl || typeof videoUrl !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    if (!deps.isDbConnected() || !deps.getPrisma()) return;

    const itemTitle =
      typeof title === "string" ? title.trim().slice(0, 200) : "Untitled";
    const senderUsername =
      socket.data?.authUser?.username ||
      state.socketIdToUsername.get(socket.id) ||
      null;

    try {
      // Verify the playlist belongs to this room before adding items.
      const playlistCheck = await deps.getPrisma().roomPlaylist.findFirst({
        where: { id: playlistId, roomId },
        select: { id: true },
      });
      if (!playlistCheck) return;

      // Get the highest position in the playlist
      const lastItem = await deps.getPrisma().roomPlaylistItem.findFirst({
        where: { playlistId },
        orderBy: { position: "desc" },
        select: { position: true },
      });

      const nextPosition = (lastItem?.position ?? -1) + 1;

      await deps.getPrisma().roomPlaylistItem.create({
        data: {
          playlistId,
          videoUrl: videoUrl.slice(0, 2000),
          title: itemTitle,
          duration: typeof duration === "number" ? duration : null,
          thumbnail:
            typeof thumbnail === "string" ? thumbnail.slice(0, 2000) : null,
          addedBy: socket.id,
          addedByUsername: senderUsername,
          position: nextPosition,
        },
      });

      await emitPlaylistStateToRoom(deps, state, io, roomId);
    } catch (err) {
      console.error("Failed to add playlist item:", err.message);
    }
  });

  socket.on("playlist_remove_item", async (data) => {
    const { roomId, playlistId, itemId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!playlistId || typeof playlistId !== "string") return;
    if (!itemId || typeof itemId !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    if (!deps.isDbConnected() || !deps.getPrisma()) return;

    try {
      // deleteMany with a relation filter ensures the item belongs to this room.
      await deps.getPrisma().roomPlaylistItem.deleteMany({
        where: { id: itemId, playlist: { roomId } },
      });

      await emitPlaylistStateToRoom(deps, state, io, roomId);
    } catch (err) {
      console.error("Failed to remove playlist item:", err.message);
    }
  });

  socket.on("playlist_reorder_items", async (data) => {
    const { roomId, playlistId, itemIds } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!playlistId || typeof playlistId !== "string") return;
    if (!Array.isArray(itemIds)) return;
    if (itemIds.length > 500) return;
    if (itemIds.some((id) => typeof id !== "string")) return;
    if (!socket.rooms.has(roomId)) return;
    if (!deps.isDbConnected() || !deps.getPrisma()) return;

    try {
      // Get current active state to track the currently playing item
      const activeState = state.roomPlaylistActive.get(roomId);
      let currentPlayingItemId = null;

      // If this is the active playlist, find the currently playing item
      if (activeState && activeState.activePlaylistId === playlistId) {
        const playlist = await deps.getPrisma().roomPlaylist.findUnique({
          where: { id: playlistId },
          include: {
            items: {
              orderBy: { position: "asc" },
            },
          },
        });

        if (playlist && playlist.items[activeState.currentItemIndex]) {
          currentPlayingItemId =
            playlist.items[activeState.currentItemIndex].id;
        }
      }

      // Update positions for all items
      await deps.getPrisma().$transaction(
        itemIds.map((id, index) =>
          deps.getPrisma().roomPlaylistItem.update({
            where: { id },
            data: { position: index },
          }),
        ),
      );

      // If we were tracking a currently playing item, update the index to its new position
      if (currentPlayingItemId && activeState) {
        const newIndex = itemIds.indexOf(currentPlayingItemId);
        if (newIndex !== -1) {
          state.roomPlaylistActive.set(roomId, {
            activePlaylistId: playlistId,
            currentItemIndex: newIndex,
          });
        }
      }

      await emitPlaylistStateToRoom(deps, state, io, roomId);
    } catch (err) {
      console.error("Failed to reorder playlist items:", err.message);
    }
  });
}

module.exports = {
  attachPlaylistItemHandlers,
};
