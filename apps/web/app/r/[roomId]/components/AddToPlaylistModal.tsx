"use client";

import React, { useState, useCallback, useEffect } from "react";
import type { Playlist } from "shared-logic";
import { Modal } from "../../../components/Modal";
import { getYouTubeStartTime, formatStartTime } from "../lib/video";

interface AddToPlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  playlists: Playlist[];
  videoUrl: string | null;
  defaultTitle?: string;
  onAddToPlaylist: (
    playlistId: string,
    videoUrl: string,
    title: string,
    duration?: number,
    thumbnail?: string,
  ) => void;
  onCreatePlaylist: (name: string, description?: string) => void;
}

const CloseIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
  </svg>
);

const PlusIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
  </svg>
);

function getTitleFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);

    // YouTube
    if (
      urlObj.hostname.includes("youtube.com") ||
      urlObj.hostname.includes("youtu.be")
    ) {
      const videoId = urlObj.hostname.includes("youtu.be")
        ? urlObj.pathname.slice(1)
        : urlObj.searchParams.get("v");
      return videoId ? `YouTube Video (${videoId})` : "YouTube Video";
    }

    // Twitch
    if (urlObj.hostname.includes("twitch.tv")) {
      const pathParts = urlObj.pathname.split("/").filter(Boolean);
      if (pathParts.length > 0) {
        return `Twitch: ${pathParts[0]}`;
      }
      return "Twitch Stream";
    }

    // Kick
    if (urlObj.hostname.includes("kick.com")) {
      const pathParts = urlObj.pathname.split("/").filter(Boolean);
      if (pathParts.length > 0) {
        return `Kick: ${pathParts[0]}`;
      }
      return "Kick Stream";
    }

    // Direct video file
    if (/\.(mp4|webm|ogg|m3u8|mkv|avi|mov)$/i.test(urlObj.pathname)) {
      const filename = urlObj.pathname.split("/").pop() || "";
      return filename || "Direct Video";
    }

    // Fallback to hostname
    return urlObj.hostname;
  } catch {
    return url.slice(0, 50);
  }
}

export function AddToPlaylistModal({
  isOpen,
  onClose,
  playlists,
  videoUrl,
  defaultTitle,
  onAddToPlaylist,
  onCreatePlaylist,
}: AddToPlaylistModalProps) {
  const [title, setTitle] = useState("");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(
    null,
  );
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [addedToPlaylists, setAddedToPlaylists] = useState<Set<string>>(
    new Set(),
  );

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen && videoUrl) {
      setTitle(defaultTitle || getTitleFromUrl(videoUrl));
      setSelectedPlaylistId(playlists[0]?.id ?? null);
      setAddedToPlaylists(new Set());
      setIsCreatingPlaylist(false);
      setNewPlaylistName("");
    }
  }, [isOpen, videoUrl, defaultTitle, playlists]);

  const handleAddToPlaylist = useCallback(() => {
    if (!selectedPlaylistId || !videoUrl || !title.trim()) return;

    onAddToPlaylist(selectedPlaylistId, videoUrl, title.trim());
    setAddedToPlaylists((prev) => new Set(prev).add(selectedPlaylistId));
  }, [selectedPlaylistId, videoUrl, title, onAddToPlaylist]);

  const handleCreatePlaylist = useCallback(() => {
    if (!newPlaylistName.trim()) return;
    onCreatePlaylist(newPlaylistName.trim());
    setNewPlaylistName("");
    setIsCreatingPlaylist(false);
  }, [newPlaylistName, onCreatePlaylist]);

  if (!videoUrl) return null;

  const titleId = "add-to-playlist-title";

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      labelledBy={titleId}
      panelClassName="bg-surface border border-hairline rounded-[var(--radius-panel)] shadow-2xl w-full max-w-md mx-4 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-hairline">
        <h3 id={titleId} className="text-lg font-semibold text-ink">
          Add to Playlist
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-ink-muted hover:text-ink transition"
          title="Close modal"
          aria-label="Close modal"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Video URL preview */}
        <div className="bg-sunken rounded-[var(--radius-control)] px-3 py-2">
          <div className="text-xs text-ink-faint truncate">{videoUrl}</div>
          {(() => {
            const startTime = getYouTubeStartTime(videoUrl);
            if (startTime && startTime > 0) {
              return (
                <div className="text-xs text-indigo-400 mt-1">
                  ⏱ Starts at {formatStartTime(startTime)}
                </div>
              );
            }
            return null;
          })()}
        </div>

        {/* Custom title input */}
        <div>
          <label className="block text-sm font-medium text-ink-muted mb-1.5">
            Video Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter a custom title..."
            className="w-full bg-sunken border border-hairline rounded-[var(--radius-control)] px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-sky-500/25 focus:border-sky-500/30"
            autoFocus
          />
        </div>

        {/* Playlist selection */}
        <div>
          <label className="block text-sm font-medium text-ink-muted mb-1.5">
            Select Playlist
          </label>

          {playlists.length === 0 && !isCreatingPlaylist ? (
            <div className="text-center py-4">
              <p className="text-sm text-ink-faint mb-2">No playlists yet</p>
              <button
                type="button"
                onClick={() => setIsCreatingPlaylist(true)}
                className="text-sm text-sky-400 hover:text-sky-300 transition"
              >
                Create your first playlist
              </button>
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {playlists.map((playlist) => {
                const isAdded = addedToPlaylists.has(playlist.id);
                const isSelected = selectedPlaylistId === playlist.id;

                return (
                  <button
                    key={playlist.id}
                    type="button"
                    onClick={() =>
                      !isAdded && setSelectedPlaylistId(playlist.id)
                    }
                    disabled={isAdded}
                    className={`w-full flex items-center gap-3 p-3 rounded-[var(--radius-control)] border transition text-left ${
                      isAdded
                        ? "bg-positive-soft border-positive cursor-default"
                        : isSelected
                          ? "bg-accent/20 border-sky-500/30"
                          : "bg-sunken border-hairline hover:bg-surface hover:border-hairline-strong"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div
                        className={`text-sm font-medium ${isAdded ? "text-positive" : "text-ink"}`}
                      >
                        {playlist.name}
                      </div>
                      <div className="text-xs text-ink-faint">
                        {playlist.items.length} items
                      </div>
                    </div>
                    {isAdded && (
                      <span className="text-positive">
                        <CheckIcon />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Create new playlist */}
          {isCreatingPlaylist ? (
            <div className="mt-2 p-3 bg-sunken rounded-[var(--radius-control)] border border-hairline space-y-2">
              <input
                type="text"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="New playlist name..."
                className="w-full bg-sunken border border-hairline rounded-[var(--radius-control)] px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-sky-500/25"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCreatePlaylist();
                  }
                }}
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setIsCreatingPlaylist(false)}
                  className="px-3 py-1.5 text-sm text-ink-muted hover:text-ink transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreatePlaylist}
                  disabled={!newPlaylistName.trim()}
                  className="px-3 py-1.5 text-sm bg-sky-600 hover:bg-accent text-white rounded-[var(--radius-control)] transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create
                </button>
              </div>
            </div>
          ) : (
            playlists.length > 0 && (
              <button
                type="button"
                onClick={() => setIsCreatingPlaylist(true)}
                className="mt-2 w-full p-2 text-sm text-ink-muted hover:text-ink border border-dashed border-hairline-strong hover:border-white/40 rounded-[var(--radius-control)] transition flex items-center justify-center gap-2"
              >
                <PlusIcon />
                Create new playlist
              </button>
            )
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 p-4 border-t border-hairline bg-sunken">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm text-ink-muted hover:text-ink transition"
        >
          Close
        </button>
        <button
          type="button"
          onClick={handleAddToPlaylist}
          disabled={
            !selectedPlaylistId ||
            !title.trim() ||
            addedToPlaylists.has(selectedPlaylistId || "")
          }
          className="px-4 py-2 text-sm bg-sky-600 hover:bg-accent text-white rounded-[var(--radius-control)] transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add to Playlist
        </button>
      </div>
    </Modal>
  );
}
