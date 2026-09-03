"use client";

import React, { useCallback, useState } from "react";

import {
  CloseIcon,
  LoopIcon,
  PlusIcon,
  SettingsIcon,
  ShuffleIcon,
  SkipNextIcon,
  SkipPrevIcon,
} from "./icons";
import { CreatePlaylistForm } from "./CreatePlaylistForm";
import { PlaylistItemRow } from "./PlaylistItemRow";
import { PlaylistSettingsForm } from "./PlaylistSettingsForm";
import type { PlaylistPanelProps } from "./types";

export function PlaylistPanel({
  playlists,
  activePlaylistId,
  currentItemIndex,
  isOpen,
  onClose,
  onCreatePlaylist,
  onUpdatePlaylist,
  onDeletePlaylist,
  onRemoveItem,
  onReorderItems,
  onSetActive,
  onPlayItem,
  onPlayNext,
  onPlayPrevious,
  onAddCurrentVideo,
  onOpenAddVideos,
  currentVideoUrl,
}: PlaylistPanelProps) {
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(
    playlists[0]?.id ?? null,
  );
  const [isCreating, setIsCreating] = useState(false);
  const [settingsPlaylistId, setSettingsPlaylistId] = useState<string | null>(
    null,
  );

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const selectedPlaylist =
    playlists.find((p) => p.id === selectedPlaylistId) ?? null;
  const activePlaylist =
    playlists.find((p) => p.id === activePlaylistId) ?? null;
  const settingsPlaylist =
    playlists.find((p) => p.id === settingsPlaylistId) ?? null;

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (dragIndex !== null && dragIndex !== index) {
        setDragOverIndex(index);
      }
    },
    [dragIndex],
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback(
    (targetIndex: number) => {
      if (dragIndex === null || !selectedPlaylist) return;
      if (dragIndex === targetIndex) {
        handleDragEnd();
        return;
      }

      const items = [...selectedPlaylist.items];
      const [draggedItem] = items.splice(dragIndex, 1);
      if (draggedItem) {
        items.splice(targetIndex, 0, draggedItem);
      }

      const newItemIds = items.map((item) => item.id);
      onReorderItems(selectedPlaylist.id, newItemIds);

      handleDragEnd();
    },
    [dragIndex, selectedPlaylist, onReorderItems, handleDragEnd],
  );

  const handleMoveItem = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (!selectedPlaylist) return;
      if (toIndex < 0 || toIndex >= selectedPlaylist.items.length) return;

      const items = [...selectedPlaylist.items];
      const [movedItem] = items.splice(fromIndex, 1);
      if (!movedItem) return;
      items.splice(toIndex, 0, movedItem);
      onReorderItems(
        selectedPlaylist.id,
        items.map((item) => item.id),
      );
    },
    [selectedPlaylist, onReorderItems],
  );

  const handleCreatePlaylist = useCallback(
    (name: string, description?: string) => {
      onCreatePlaylist(name, description);
      setIsCreating(false);
    },
    [onCreatePlaylist],
  );

  const handleSelectPlaylist = useCallback((playlistId: string) => {
    setSelectedPlaylistId(playlistId);
    setSettingsPlaylistId(null);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="panel flex flex-col overflow-hidden h-full">
      <div className="flex items-center justify-between p-4 border-b border-hairline bg-surface">
        <h3 className="font-semibold text-ink">Playlists</h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-ink-muted hover:text-ink transition"
          title="Close playlist panel"
          aria-label="Close playlist panel"
        >
          <CloseIcon />
        </button>
      </div>

      {activePlaylist && activePlaylist.items[currentItemIndex] && (
        <div className="p-3 bg-accent-tint border-b border-hairline">
          <div className="text-xs text-ink-muted uppercase tracking-wider mb-2">
            Now Playing
          </div>

          <div className="flex gap-3 items-start mb-2">
            {activePlaylist.items[currentItemIndex].thumbnail && (
              <div className="w-24 h-13.5 shrink-0 rounded overflow-hidden bg-sunken">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={activePlaylist.items[currentItemIndex].thumbnail}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="text-sm text-ink line-clamp-2 leading-snug">
                {activePlaylist.items[currentItemIndex].title}
              </div>
              <div className="text-xs text-ink-faint mt-1">
                {activePlaylist.name}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPlayPrevious}
              aria-label="Previous video"
              className="p-1.5 text-ink-muted hover:text-ink transition"
              title="Previous"
            >
              <SkipPrevIcon />
            </button>
            <button
              type="button"
              onClick={onPlayNext}
              aria-label="Next video"
              className="p-1.5 text-ink-muted hover:text-ink transition"
              title="Next"
            >
              <SkipNextIcon />
            </button>
            <div className="flex-1" />
            <span
              className={`p-1 rounded ${activePlaylist.settings.loop ? "text-accent" : "text-ink-faint"}`}
              title="Loop"
            >
              <LoopIcon />
            </span>
            <span
              className={`p-1 rounded ${activePlaylist.settings.shuffle ? "text-accent" : "text-ink-faint"}`}
              title="Shuffle"
            >
              <ShuffleIcon />
            </span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-1 p-2 border-b border-hairline overflow-x-auto">
        {playlists.map((playlist) => (
          <button
            key={playlist.id}
            type="button"
            onClick={() => handleSelectPlaylist(playlist.id)}
            aria-pressed={selectedPlaylistId === playlist.id ? "true" : "false"}
            className={`px-3 py-1.5 text-sm rounded-[var(--radius-control)] whitespace-nowrap transition ${
              selectedPlaylistId === playlist.id
                ? "bg-accent-soft text-accent border border-accent"
                : "text-ink-muted hover:text-ink hover:bg-surface"
            }`}
          >
            {playlist.name}
            {playlist.id === activePlaylistId && (
              <span className="ml-1 text-xs text-accent" aria-label="Active">
                ●
              </span>
            )}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="p-1.5 text-ink-muted hover:text-ink hover:bg-surface rounded-[var(--radius-control)] transition"
          title="Create playlist"
          aria-label="Create new playlist"
        >
          <PlusIcon />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isCreating && (
          <CreatePlaylistForm
            onSubmit={handleCreatePlaylist}
            onCancel={() => setIsCreating(false)}
          />
        )}

        {settingsPlaylist && (
          <PlaylistSettingsForm
            playlist={settingsPlaylist}
            onUpdate={(updates) =>
              onUpdatePlaylist(settingsPlaylist.id, updates)
            }
            onDelete={() => {
              onDeletePlaylist(settingsPlaylist.id);
              setSettingsPlaylistId(null);
              if (selectedPlaylistId === settingsPlaylist.id) {
                setSelectedPlaylistId(
                  playlists.find((p) => p.id !== settingsPlaylist.id)?.id ??
                    null,
                );
              }
            }}
            onClose={() => setSettingsPlaylistId(null)}
          />
        )}

        {selectedPlaylist && !settingsPlaylistId && (
          <>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h4 className="text-sm font-medium text-ink">
                  {selectedPlaylist.name}
                </h4>
                {selectedPlaylist.description && (
                  <p className="text-xs text-ink-faint">
                    {selectedPlaylist.description}
                  </p>
                )}
                <p className="text-xs text-ink-faint">
                  {selectedPlaylist.items.length} items
                </p>
              </div>
              <div className="flex items-center gap-1">
                {selectedPlaylistId !== activePlaylistId &&
                  selectedPlaylist.items.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onSetActive(selectedPlaylistId)}
                      className="px-2 py-1 text-xs bg-accent text-accent-ink hover:brightness-110 rounded-[var(--radius-control)] transition"
                    >
                      Set Active
                    </button>
                  )}
                <button
                  type="button"
                  onClick={() => setSettingsPlaylistId(selectedPlaylistId)}
                  className="p-1.5 text-ink-muted hover:text-ink transition"
                  title="Playlist settings"
                  aria-label="Open playlist settings"
                >
                  <SettingsIcon />
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              {onOpenAddVideos && (
                <button
                  type="button"
                  onClick={onOpenAddVideos}
                  className="flex-1 p-2 text-sm text-accent bg-accent-soft hover:bg-accent-tint border border-accent rounded-[var(--radius-control)] transition flex items-center justify-center gap-2"
                >
                  <PlusIcon />
                  Add Videos
                </button>
              )}
              {currentVideoUrl && onAddCurrentVideo && (
                <button
                  type="button"
                  onClick={onAddCurrentVideo}
                  className="flex-1 p-2 text-sm text-ink-muted hover:text-ink border border-dashed border-hairline-strong hover:border-white/40 rounded-[var(--radius-control)] transition flex items-center justify-center gap-2"
                  title="Add the currently playing video"
                >
                  <PlusIcon />
                  Current
                </button>
              )}
            </div>

            {selectedPlaylist.items.length === 0 ? (
              <div className="text-center text-ink-faint py-8 text-sm">
                No videos in this playlist yet.
                <br />
                <span className="text-xs">
                  Click the + button on a video to add it.
                </span>
              </div>
            ) : (
              <div className="space-y-1">
                {selectedPlaylist.items.map((item, index) => (
                  <PlaylistItemRow
                    key={item.id}
                    item={item}
                    index={index}
                    isActive={
                      selectedPlaylist.id === activePlaylistId &&
                      index === currentItemIndex
                    }
                    isPlaying={
                      selectedPlaylist.id === activePlaylistId &&
                      index === currentItemIndex
                    }
                    isDragging={dragIndex === index}
                    isDragOver={dragOverIndex === index}
                    canMoveUp={index > 0}
                    canMoveDown={index < selectedPlaylist.items.length - 1}
                    onPlay={() => onPlayItem(selectedPlaylist.id, item.id)}
                    onRemove={() => onRemoveItem(selectedPlaylist.id, item.id)}
                    onMoveUp={() => handleMoveItem(index, index - 1)}
                    onMoveDown={() => handleMoveItem(index, index + 1)}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragEnd={handleDragEnd}
                    onDrop={handleDrop}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {playlists.length === 0 && !isCreating && (
          <div className="text-center text-ink-faint py-8 text-sm">
            No playlists yet.
            <br />
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="text-accent hover:brightness-110 mt-2 transition"
            >
              Create your first playlist
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
