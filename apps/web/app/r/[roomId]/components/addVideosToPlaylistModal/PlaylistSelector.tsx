import React from "react";

import type { Playlist } from "shared-logic";

import { PlusIcon } from "./icons";

export function PlaylistSelector(props: {
  playlists: Playlist[];
  selectedPlaylistId: string | null;
  setSelectedPlaylistId: (id: string | null) => void;

  isCreatingPlaylist: boolean;
  setIsCreatingPlaylist: (v: boolean) => void;
  newPlaylistName: string;
  setNewPlaylistName: (v: string) => void;
  handleCreatePlaylist: () => void;
}) {
  const {
    playlists,
    selectedPlaylistId,
    setSelectedPlaylistId,
    isCreatingPlaylist,
    setIsCreatingPlaylist,
    newPlaylistName,
    setNewPlaylistName,
    handleCreatePlaylist,
  } = props;

  return (
    <div className="p-4 border-b border-hairline shrink-0">
      <label className="text-sm text-ink-muted mb-2 block">
        Select Playlist
      </label>
      <div className="flex gap-2">
        <select
          value={selectedPlaylistId || ""}
          onChange={(e) => setSelectedPlaylistId(e.target.value || null)}
          className="flex-1 bg-sunken border border-hairline rounded-[var(--radius-control)] px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
          title="Select a playlist"
          aria-label="Select a playlist to add videos to"
        >
          {playlists.length === 0 && <option value="">No playlists yet</option>}
          {playlists.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.items.length} videos)
            </option>
          ))}
        </select>

        {isCreatingPlaylist ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              placeholder="Playlist name"
              className="bg-sunken border border-hairline rounded-[var(--radius-control)] px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent"
              onKeyDown={(e) => e.key === "Enter" && handleCreatePlaylist()}
              autoFocus
            />
            <button
              type="button"
              onClick={handleCreatePlaylist}
              disabled={!newPlaylistName.trim()}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 rounded-[var(--radius-control)] text-sm font-medium text-white transition"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setIsCreatingPlaylist(false)}
              className="px-3 py-2 bg-surface hover:bg-raised border border-hairline rounded-[var(--radius-control)] text-sm text-ink transition"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsCreatingPlaylist(true)}
            className="px-4 py-2 bg-surface hover:bg-raised border border-hairline rounded-[var(--radius-control)] text-sm font-medium text-ink transition flex items-center gap-2"
          >
            <PlusIcon />
            New
          </button>
        )}
      </div>
    </div>
  );
}
