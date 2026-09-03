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
      className={`group flex items-center gap-2 p-2 rounded-[var(--radius-control)] transition cursor-grab active:cursor-grabbing ${
        isDragging
          ? "opacity-50 bg-raised border border-dashed border-white/30"
          : isDragOver
            ? "bg-accent-tint border border-accent"
            : isActive
              ? "bg-accent-soft border border-accent"
              : "hover:bg-surface border border-transparent"
      }`}
    >
      <button
        type="button"
        onClick={onPlay}
        aria-label={`Play ${item.title}`}
        aria-current={isActive ? "true" : undefined}
        className="flex flex-1 min-w-0 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span
          aria-hidden="true"
          className="shrink-0 text-ink-faint opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
        >
          <DragHandleIcon />
        </span>

        {item.thumbnail ? (
          <span className="w-16 h-9 shrink-0 rounded overflow-hidden bg-sunken relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.thumbnail}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
            {isPlaying && (
              <span className="absolute inset-0 bg-sunken flex items-center justify-center">
                <span className="text-accent">
                  <PauseIcon />
                </span>
              </span>
            )}
            {!isPlaying && isActive && (
              <span className="absolute inset-0 bg-sunken flex items-center justify-center">
                <span className="text-accent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                  <PlayIcon />
                </span>
              </span>
            )}
          </span>
        ) : (
          <span className="w-10 h-10 shrink-0 flex items-center justify-center">
            {isPlaying ? (
              <span className="text-accent">
                <PauseIcon />
              </span>
            ) : (
              <span
                className={`${isActive ? "text-accent" : "text-ink-faint group-hover:text-ink-muted"}`}
              >
                <PlayIcon />
              </span>
            )}
          </span>
        )}

        <span className="flex-1 min-w-0">
          <span className="block text-sm text-ink truncate">{item.title}</span>
          {item.duration && (
            <span className="block text-xs text-ink-faint">
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
            className="h-7 min-w-7 rounded text-ink-muted opacity-70 transition hover:bg-raised hover:text-ink focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-25"
            title="Move up"
            aria-label={`Move ${item.title} up`}
          >
            <span aria-hidden="true">↑</span>
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            className="h-7 min-w-7 rounded text-ink-muted opacity-70 transition hover:bg-raised hover:text-ink focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-25"
            title="Move down"
            aria-label={`Move ${item.title} down`}
          >
            <span aria-hidden="true">↓</span>
          </button>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="opacity-60 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 p-1.5 text-ink-faint hover:text-red-400 focus-visible:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70 rounded transition"
          title="Remove from playlist"
          aria-label="Remove from playlist"
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}
