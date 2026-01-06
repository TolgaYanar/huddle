"use client";

import React, { useState, useCallback } from "react";
import type { Playlist, PlaylistItem, PlaylistSettings } from "shared-logic";

interface PlaylistPanelProps {
  playlists: Playlist[];
  activePlaylistId: string | null;
  currentItemIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onCreatePlaylist: (
    name: string,
    description?: string,
    settings?: Partial<PlaylistSettings>
  ) => void;
  onUpdatePlaylist: (
    playlistId: string,
    updates: {
      name?: string;
      description?: string;
      settings?: Partial<PlaylistSettings>;
    }
  ) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onRemoveItem: (playlistId: string, itemId: string) => void;
  onReorderItems: (playlistId: string, itemIds: string[]) => void;
  onSetActive: (playlistId: string | null) => void;
  onPlayItem: (playlistId: string, itemId: string) => void;
  onPlayNext: () => void;
  onPlayPrevious: () => void;
  onAddCurrentVideo?: () => void;
  onOpenAddVideos?: () => void;
  currentVideoUrl?: string;
}

function formatDuration(seconds?: number): string {
  if (!seconds || !isFinite(seconds)) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const PlayIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const PauseIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
  </svg>
);

const SkipNextIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
  </svg>
);

const SkipPrevIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
  </svg>
);

const SettingsIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" />
  </svg>
);

const PlusIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
  </svg>
);

const CloseIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
  </svg>
);

const LoopIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" />
  </svg>
);

const ShuffleIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
  </svg>
);

interface CreatePlaylistFormProps {
  onSubmit: (name: string, description?: string) => void;
  onCancel: () => void;
}

function CreatePlaylistForm({ onSubmit, onCancel }: CreatePlaylistFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit(name.trim(), description.trim() || undefined);
    setName("");
    setDescription("");
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="p-3 bg-black/20 rounded-lg border border-white/10 space-y-2"
    >
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Playlist name..."
        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/25"
        autoFocus
      />
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)..."
        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/25"
      />
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 transition"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!name.trim()}
          className="px-3 py-1.5 text-sm bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Create
        </button>
      </div>
    </form>
  );
}

interface PlaylistSettingsFormProps {
  playlist: Playlist;
  onUpdate: (updates: {
    settings?: Partial<PlaylistSettings>;
    name?: string;
    description?: string;
  }) => void;
  onDelete: () => void;
  onClose: () => void;
}

function PlaylistSettingsForm({
  playlist,
  onUpdate,
  onDelete,
  onClose,
}: PlaylistSettingsFormProps) {
  const [name, setName] = useState(playlist.name);
  const [description, setDescription] = useState(playlist.description || "");
  const [loop, setLoop] = useState(playlist.settings.loop);
  const [shuffle, setShuffle] = useState(playlist.settings.shuffle);
  const [autoPlay, setAutoPlay] = useState(playlist.settings.autoPlay);

  const handleSave = () => {
    onUpdate({
      name: name !== playlist.name ? name : undefined,
      description:
        description !== playlist.description ? description : undefined,
      settings: {
        loop,
        shuffle,
        autoPlay,
      },
    });
    onClose();
  };

  return (
    <div className="p-3 bg-black/30 rounded-lg border border-white/10 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-200">
          Playlist Settings
        </h4>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-200"
          title="Close settings"
          aria-label="Close settings"
        >
          <CloseIcon />
        </button>
      </div>

      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Playlist name..."
        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/25"
      />

      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)..."
        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/25"
      />

      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={loop}
            onChange={(e) => setLoop(e.target.checked)}
            className="w-4 h-4 rounded bg-black/30 border-white/20 text-sky-500 focus:ring-sky-500/25"
          />
          <span className="text-sm text-slate-300">Loop playlist</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={shuffle}
            onChange={(e) => setShuffle(e.target.checked)}
            className="w-4 h-4 rounded bg-black/30 border-white/20 text-sky-500 focus:ring-sky-500/25"
          />
          <span className="text-sm text-slate-300">Shuffle</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={autoPlay}
            onChange={(e) => setAutoPlay(e.target.checked)}
            className="w-4 h-4 rounded bg-black/30 border-white/20 text-sky-500 focus:ring-sky-500/25"
          />
          <span className="text-sm text-slate-300">Auto-play next</span>
        </label>
      </div>

      <div className="flex gap-2 justify-between pt-2 border-t border-white/10">
        <button
          onClick={onDelete}
          className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition flex items-center gap-1"
        >
          <TrashIcon /> Delete
        </button>
        <button
          onClick={handleSave}
          className="px-3 py-1.5 text-sm bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition"
        >
          Save
        </button>
      </div>
    </div>
  );
}

const DragHandleIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
  </svg>
);

interface PlaylistItemRowProps {
  item: PlaylistItem;
  index: number;
  isActive: boolean;
  isPlaying: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  onPlay: () => void;
  onRemove: () => void;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  onDrop: (index: number) => void;
}

function PlaylistItemRow({
  item,
  index,
  isActive,
  isPlaying,
  isDragging,
  isDragOver,
  onPlay,
  onRemove,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}: PlaylistItemRowProps) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", index.toString());
        onDragStart(index);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOver(e, index);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(index);
      }}
      onDragEnd={onDragEnd}
      className={`group flex items-center gap-2 p-2 rounded-lg transition cursor-grab active:cursor-grabbing ${
        isDragging
          ? "opacity-50 bg-white/10 border border-dashed border-white/30"
          : isDragOver
            ? "bg-indigo-500/20 border border-indigo-500/50"
            : isActive
              ? "bg-sky-500/20 border border-sky-500/30"
              : "hover:bg-white/5 border border-transparent"
      }`}
      onClick={onPlay}
    >
      {/* Drag handle */}
      <div className="shrink-0 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
        <DragHandleIcon />
      </div>

      {/* Thumbnail */}
      {item.thumbnail ? (
        <div className="w-16 h-9 shrink-0 rounded overflow-hidden bg-black/30 relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.thumbnail}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
          {isPlaying && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <div className="text-sky-400">
                <PauseIcon />
              </div>
            </div>
          )}
          {!isPlaying && isActive && (
            <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
              <div className="text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity">
                <PlayIcon />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="w-10 h-10 shrink-0 flex items-center justify-center">
          {isPlaying ? (
            <div className="text-sky-400">
              <PauseIcon />
            </div>
          ) : (
            <div
              className={`${isActive ? "text-sky-400" : "text-slate-500 group-hover:text-slate-300"}`}
            >
              <PlayIcon />
            </div>
          )}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="text-sm text-slate-200 truncate">{item.title}</div>
        {item.duration && (
          <div className="text-xs text-slate-500">
            {formatDuration(item.duration)}
          </div>
        )}
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-red-400 transition"
        title="Remove from playlist"
        aria-label="Remove from playlist"
      >
        <TrashIcon />
      </button>
    </div>
  );
}

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
    playlists[0]?.id ?? null
  );
  const [isCreating, setIsCreating] = useState(false);
  const [settingsPlaylistId, setSettingsPlaylistId] = useState<string | null>(
    null
  );

  // Drag and drop state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const selectedPlaylist =
    playlists.find((p) => p.id === selectedPlaylistId) ?? null;
  const activePlaylist =
    playlists.find((p) => p.id === activePlaylistId) ?? null;
  const settingsPlaylist =
    playlists.find((p) => p.id === settingsPlaylistId) ?? null;

  // Handle drag and drop reordering
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
    [dragIndex]
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

      // Create new order by moving the dragged item to the target position
      const items = [...selectedPlaylist.items];
      const [draggedItem] = items.splice(dragIndex, 1);
      if (draggedItem) {
        items.splice(targetIndex, 0, draggedItem);
      }

      // Send new order to server
      const newItemIds = items.map((item) => item.id);
      onReorderItems(selectedPlaylist.id, newItemIds);

      handleDragEnd();
    },
    [dragIndex, selectedPlaylist, onReorderItems, handleDragEnd]
  );

  const handleCreatePlaylist = useCallback(
    (name: string, description?: string) => {
      onCreatePlaylist(name, description);
      setIsCreating(false);
    },
    [onCreatePlaylist]
  );

  const handleSelectPlaylist = useCallback((playlistId: string) => {
    setSelectedPlaylistId(playlistId);
    setSettingsPlaylistId(null);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="backdrop-blur-md bg-white/5 rounded-2xl border border-white/10 flex flex-col overflow-hidden h-full">
      {/* Header */}
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

      {/* Now Playing */}
      {activePlaylist && activePlaylist.items[currentItemIndex] && (
        <div className="p-3 bg-linear-to-r from-sky-500/10 to-purple-500/10 border-b border-white/10">
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">
            Now Playing
          </div>

          <div className="flex gap-3 items-start mb-2">
            {/* Thumbnail */}
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

          {/* Playback controls */}
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

      {/* Playlist Tabs */}
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

      {/* Content */}
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
                    null
                );
              }
            }}
            onClose={() => setSettingsPlaylistId(null)}
          />
        )}

        {selectedPlaylist && !settingsPlaylistId && (
          <>
            {/* Playlist header */}
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

            {/* Add videos buttons */}
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

            {/* Items list */}
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
