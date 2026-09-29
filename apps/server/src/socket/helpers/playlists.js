async function getPlaylistsForRoom({ isDbConnected, getPrisma }, roomId) {
  if (!isDbConnected() || !getPrisma()) return [];
  try {
    const playlists = await getPrisma().roomPlaylist.findMany({
      where: { roomId },
      include: {
        items: {
          orderBy: { position: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return playlists.map((p) => ({
      id: p.id,
      roomId: p.roomId,
      name: p.name,
      description: p.description,
      createdBy: p.createdBy,
      createdByUsername: p.createdByUsername,
      createdAt: p.createdAt.getTime(),
      updatedAt: p.updatedAt.getTime(),
      isDefault: p.isDefault,
      settings: {
        loop: p.loop,
        shuffle: p.shuffle,
        autoPlay: p.autoPlay,
      },
      items: p.items.map((item) => ({
        id: item.id,
        videoUrl: item.videoUrl,
        title: item.title,
        addedBy: item.addedBy,
        addedByUsername: item.addedByUsername,
        addedAt: item.addedAt.getTime(),
        duration: item.duration,
        thumbnail: item.thumbnail,
      })),
    }));
  } catch (err) {
    console.error("Failed to get playlists:", err.message);
    return [];
  }
}

async function emitPlaylistStateTo(
  deps,
  state,
  socket,
  roomId,
  shouldEmit = () => true,
) {
  const playlists = await getPlaylistsForRoom(deps, roomId);
  // Membership can be revoked while the DB query is in flight (explicit
  // leave, kick, or disconnect). Check at the last possible moment so private
  // playlist data is never emitted to a socket whose join was cancelled.
  if (!shouldEmit()) return;
  const activeState = state.roomPlaylistActive.get(roomId) || {
    activePlaylistId: null,
    currentItemIndex: 0,
  };

  socket.emit("playlist_state", {
    roomId,
    playlists,
    activePlaylistId: activeState.activePlaylistId,
    currentItemIndex: activeState.currentItemIndex,
  });
}

async function emitPlaylistStateToRoom(deps, state, io, roomId) {
  const playlists = await getPlaylistsForRoom(deps, roomId);
  const activeState = state.roomPlaylistActive.get(roomId) || {
    activePlaylistId: null,
    currentItemIndex: 0,
  };

  io.to(roomId).emit("playlist_state", {
    roomId,
    playlists,
    activePlaylistId: activeState.activePlaylistId,
    currentItemIndex: activeState.currentItemIndex,
  });
}

// A playlist import adds at most 500 videos, so these only bite on abuse:
// each write re-broadcasts every playlist with every item to the room, so an
// unbounded room made every later write (and every join) slower without end.
const MAX_PLAYLISTS_PER_ROOM = 25;
const MAX_ITEMS_PER_PLAYLIST = 1000;

module.exports = {
  MAX_PLAYLISTS_PER_ROOM,
  MAX_ITEMS_PER_PLAYLIST,
  getPlaylistsForRoom,
  emitPlaylistStateTo,
  emitPlaylistStateToRoom,
};
