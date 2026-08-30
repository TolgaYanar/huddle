import React from "react";

import { DragHandleIcon, PauseIcon, PlayIcon, TrashIcon } from "./icons";
import { formatDuration } from "./utils";
import type { PlaylistItemRowProps } from "./types";

export function PlaylistItemRow({
  item,
  index,
  isActive,
  isPlaying,
  isDragging,
  isDragOver,
  canMoveUp,
  canMoveDown,
  onPlay,
  onRemove,
  onMoveUp,
  onMoveDown,
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
    >
      <button
        type="button"
        onClick={onPlay}
        aria-label={`Play ${item.title}`}
        aria-current={isActive ? "true" : undefined}
        className="flex flex-1 min-w-0 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/80"
      >
        <span
          aria-hidden="true"
          className="shrink-0 text-slate-500 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
        >
          <DragHandleIcon />
        </span>

        {item.thumbnail ? (
          <span className="w-16 h-9 shrink-0 rounded overflow-hidden bg-black/30 relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.thumbnail}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
            {isPlaying && (
              <span className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <span className="text-sky-400">
                  <PauseIcon />
                </span>
              </span>
            )}
            {!isPlaying && isActive && (
              <span className="absolute inset-0 bg-black/20 flex items-center justify-center">
                <span className="text-sky-400 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                  <PlayIcon />
                </span>
              </span>
            )}
          </span>
        ) : (
          <span className="w-10 h-10 shrink-0 flex items-center justify-center">
            {isPlaying ? (
              <span className="text-sky-400">
                <PauseIcon />
              </span>
            ) : (
              <span
                className={`${isActive ? "text-sky-400" : "text-slate-500 group-hover:text-slate-300"}`}
              >
                <PlayIcon />
              </span>
            )}
          </span>
        )}

        <span className="flex-1 min-w-0">
          <span className="block text-sm text-slate-200 truncate">
            {item.title}
          </span>
          {item.duration && (
            <span className="block text-xs text-slate-500">
              {formatDuration(item.duration)}
            </span>
          )}
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-0.5">
        <div
          className="flex items-center gap-0.5"
          role="group"
          aria-label={`Reorder ${item.title}`}
        >
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            className="h-7 min-w-7 rounded text-slate-400 opacity-70 transition hover:bg-white/10 hover:text-slate-200 focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:cursor-not-allowed disabled:opacity-25"
            title="Move up"
            aria-label={`Move ${item.title} up`}
          >
            <span aria-hidden="true">↑</span>
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            className="h-7 min-w-7 rounded text-slate-400 opacity-70 transition hover:bg-white/10 hover:text-slate-200 focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:cursor-not-allowed disabled:opacity-25"
            title="Move down"
            aria-label={`Move ${item.title} down`}
          >
            <span aria-hidden="true">↓</span>
          </button>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="opacity-60 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 p-1.5 text-slate-500 hover:text-red-400 focus-visible:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70 rounded transition"
          title="Remove from playlist"
          aria-label="Remove from playlist"
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}
