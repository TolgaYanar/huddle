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
    <div className="backdrop-blur-md bg-white/5 rounded-2xl border border-white/10 flex flex-col overflow-hidden h-full">
      <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
        <h3 className="font-semibold text-slate-50">Playlists</h3>
        <button
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-slate-200 transition"
          title="Close playlist panel"
          aria-label="Close playlist panel"
        >
          <CloseIcon />
        </button>
      </div>

      {activePlaylist && activePlaylist.items[currentItemIndex] && (
        <div className="p-3 bg-linear-to-r from-sky-500/10 to-purple-500/10 border-b border-white/10">
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">
            Now Playing
          </div>

          <div className="flex gap-3 items-start mb-2">
            {activePlaylist.items[currentItemIndex].thumbnail && (
              <div className="w-24 h-13.5 shrink-0 rounded overflow-hidden bg-black/30">
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
              <div className="text-sm text-slate-200 line-clamp-2 leading-snug">
                {activePlaylist.items[currentItemIndex].title}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {activePlaylist.name}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onPlayPrevious}
              className="p-1.5 text-slate-400 hover:text-slate-200 transition"
              title="Previous"
            >
              <SkipPrevIcon />
            </button>
            <button
              onClick={onPlayNext}
              className="p-1.5 text-slate-400 hover:text-slate-200 transition"
              title="Next"
            >
              <SkipNextIcon />
            </button>
            <div className="flex-1" />
            <span
              className={`p-1 rounded ${activePlaylist.settings.loop ? "text-sky-400" : "text-slate-600"}`}
              title="Loop"
            >
              <LoopIcon />
            </span>
            <span
              className={`p-1 rounded ${activePlaylist.settings.shuffle ? "text-sky-400" : "text-slate-600"}`}
              title="Shuffle"
            >
              <ShuffleIcon />
            </span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-1 p-2 border-b border-white/10 overflow-x-auto">
        {playlists.map((playlist) => (
          <button
            key={playlist.id}
            onClick={() => handleSelectPlaylist(playlist.id)}
            className={`px-3 py-1.5 text-sm rounded-lg whitespace-nowrap transition ${
              selectedPlaylistId === playlist.id
                ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            {playlist.name}
            {playlist.id === activePlaylistId && (
              <span className="ml-1 text-xs text-sky-400">●</span>
            )}
          </button>
        ))}
        <button
          onClick={() => setIsCreating(true)}
          className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-white/5 rounded-lg transition"
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
                <h4 className="text-sm font-medium text-slate-200">
                  {selectedPlaylist.name}
                </h4>
                {selectedPlaylist.description && (
                  <p className="text-xs text-slate-500">
                    {selectedPlaylist.description}
                  </p>
                )}
                <p className="text-xs text-slate-500">
                  {selectedPlaylist.items.length} items
                </p>
              </div>
              <div className="flex items-center gap-1">
                {selectedPlaylistId !== activePlaylistId &&
                  selectedPlaylist.items.length > 0 && (
                    <button
                      onClick={() => onSetActive(selectedPlaylistId)}
                      className="px-2 py-1 text-xs bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition"
                    >
                      Set Active
                    </button>
                  )}
                <button
                  onClick={() => setSettingsPlaylistId(selectedPlaylistId)}
                  className="p-1.5 text-slate-400 hover:text-slate-200 transition"
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
                  onClick={onOpenAddVideos}
                  className="flex-1 p-2 text-sm text-slate-200 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 hover:border-indigo-500/50 rounded-lg transition flex items-center justify-center gap-2"
                >
                  <PlusIcon />
                  Add Videos
                </button>
              )}
              {currentVideoUrl && onAddCurrentVideo && (
                <button
                  onClick={onAddCurrentVideo}
                  className="flex-1 p-2 text-sm text-slate-400 hover:text-slate-200 border border-dashed border-white/20 hover:border-white/40 rounded-lg transition flex items-center justify-center gap-2"
                  title="Add the currently playing video"
                >
                  <PlusIcon />
                  Current
                </button>
              )}
            </div>

            {selectedPlaylist.items.length === 0 ? (
              <div className="text-center text-slate-500 py-8 text-sm">
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
                    onPlay={() => onPlayItem(selectedPlaylist.id, item.id)}
                    onRemove={() => onRemoveItem(selectedPlaylist.id, item.id)}
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
          <div className="text-center text-slate-500 py-8 text-sm">
            No playlists yet.
            <br />
            <button
              onClick={() => setIsCreating(true)}
              className="text-sky-400 hover:text-sky-300 mt-2 transition"
            >
              Create your first playlist
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
