import type * as React from "react";

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
      <div className="shrink-0 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
        <DragHandleIcon />
      </div>

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
        type="button"
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
