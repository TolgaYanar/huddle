const {
  emitPlaylistStateTo,
  emitPlaylistStateToRoom,
} = require("../helpers/playlists");

function attachPlaylistCrudHandlers(io, state, socket, deps) {
  // --- Playlist management ---
  socket.on("playlist_get", async (data) => {
    const { roomId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    await emitPlaylistStateTo(deps, state, socket, roomId);
  });

  socket.on("playlist_create", async (data) => {
    const { roomId, name, description, settings } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    if (!deps.isDbConnected() || !deps.getPrisma()) return;

    const playlistName =
      typeof name === "string" ? name.trim().slice(0, 100) : "";
    if (!playlistName) return;

    const senderUsername =
      socket.data?.authUser?.username ||
      state.socketIdToUsername.get(socket.id) ||
      null;

    try {
      await deps.getPrisma().roomPlaylist.create({
        data: {
          roomId,
          name: playlistName,
          description:
            typeof description === "string" ? description.slice(0, 500) : null,
          createdBy: socket.id,
          createdByUsername: senderUsername,
          loop: settings?.loop ?? false,
          shuffle: settings?.shuffle ?? false,
          autoPlay: settings?.autoPlay ?? true,
        },
      });

      await emitPlaylistStateToRoom(deps, state, io, roomId);
    } catch (err) {
      console.error("Failed to create playlist:", err.message);
    }
  });

  socket.on("playlist_update", async (data) => {
    const { roomId, playlistId, name, description, settings } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!playlistId || typeof playlistId !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    if (!deps.isDbConnected() || !deps.getPrisma()) return;

    try {
      const updateData = {};
      if (typeof name === "string") {
        updateData.name = name.trim().slice(0, 100);
      }
      if (typeof description === "string") {
        updateData.description = description.slice(0, 500);
      }
      if (settings && typeof settings === "object") {
        if (typeof settings.loop === "boolean") updateData.loop = settings.loop;
        if (typeof settings.shuffle === "boolean")
          updateData.shuffle = settings.shuffle;
        if (typeof settings.autoPlay === "boolean")
          updateData.autoPlay = settings.autoPlay;
      }

      if (Object.keys(updateData).length === 0) return;

      await deps.getPrisma().roomPlaylist.update({
        where: { id: playlistId },
        data: updateData,
      });

      await emitPlaylistStateToRoom(deps, state, io, roomId);
    } catch (err) {
      console.error("Failed to update playlist:", err.message);
    }
  });

  socket.on("playlist_delete", async (data) => {
    const { roomId, playlistId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!playlistId || typeof playlistId !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    if (!deps.isDbConnected() || !deps.getPrisma()) return;

    try {
      await deps.getPrisma().roomPlaylist.delete({
        where: { id: playlistId },
      });

      // Clear active state if this was the active playlist
      const activeState = state.roomPlaylistActive.get(roomId);
      if (activeState && activeState.activePlaylistId === playlistId) {
        state.roomPlaylistActive.delete(roomId);
      }

      await emitPlaylistStateToRoom(deps, state, io, roomId);
    } catch (err) {
      console.error("Failed to delete playlist:", err.message);
    }
  });

  socket.on("playlist_set_active", async (data) => {
    const { roomId, playlistId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    // playlistId can be null to clear active playlist
    const activeId = typeof playlistId === "string" ? playlistId : null;

    state.roomPlaylistActive.set(roomId, {
      activePlaylistId: activeId,
      currentItemIndex: 0,
    });

    await emitPlaylistStateToRoom(deps, state, io, roomId);
  });
}

module.exports = {
  attachPlaylistCrudHandlers,
};
