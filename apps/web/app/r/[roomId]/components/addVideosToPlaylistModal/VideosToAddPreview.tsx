import React from "react";

import { formatStartTime, getYouTubeStartTime } from "../../lib/video";

import { CheckIcon, TrashIcon } from "./icons";
import type { VideoToAdd } from "./types";

export function VideosToAddPreview(props: {
  videosToAdd: VideoToAdd[];
  selectedCount: number;
  selectAll: () => void;
  deselectAll: () => void;
  clearAll: () => void;
  toggleVideoSelection: (id: string) => void;
  updateVideoTitle: (id: string, title: string) => void;
  removeVideo: (id: string) => void;
}) {
  const {
    videosToAdd,
    selectedCount,
    selectAll,
    deselectAll,
    clearAll,
    toggleVideoSelection,
    updateVideoTitle,
    removeVideo,
  } = props;

  if (videosToAdd.length === 0) return null;

  return (
    <div className="border-t border-white/10 shrink-0">
      <div className="flex items-center justify-between p-3 bg-black/20">
        <div className="text-sm font-medium text-slate-200">
          Videos to Add ({selectedCount} / {videosToAdd.length} selected)
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={selectAll}
            className="px-2 py-1 text-xs text-slate-400 hover:text-slate-200 transition"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={deselectAll}
            className="px-2 py-1 text-xs text-slate-400 hover:text-slate-200 transition"
          >
            Deselect All
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="px-2 py-1 text-xs text-rose-400 hover:text-rose-300 transition"
          >
            Clear All
          </button>
        </div>
      </div>
      <div className="max-h-48 overflow-y-auto p-2 space-y-2">
        {videosToAdd.map((video) => (
          <div
            key={video.id}
            className={`flex items-center gap-3 p-2 rounded-xl border transition ${
              video.selected
                ? "border-indigo-500/50 bg-indigo-500/10"
                : "border-white/10 bg-black/20 opacity-60"
            }`}
          >
            <button
              type="button"
              onClick={() => toggleVideoSelection(video.id)}
              aria-label={video.selected ? "Deselect video" : "Select video"}
              aria-pressed={video.selected ? "true" : "false"}
              className={`shrink-0 w-5 h-5 rounded border flex items-center justify-center transition ${
                video.selected
                  ? "bg-indigo-600 border-indigo-600 text-white"
                  : "border-white/20 hover:border-white/40"
              }`}
            >
              {video.selected && <CheckIcon />}
            </button>

            {video.thumbnail && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={video.thumbnail}
                alt=""
                className="w-16 h-9 object-cover rounded shrink-0"
              />
            )}

            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <input
                type="text"
                value={video.title}
                onChange={(e) => updateVideoTitle(video.id, e.target.value)}
                className="w-full bg-transparent text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 rounded px-1"
                title="Edit title"
              />
              {(() => {
                const startTime = getYouTubeStartTime(video.url);
                if (startTime && startTime > 0) {
                  return (
                    <span className="text-[10px] text-indigo-400 px-1">
                      ⏱ {formatStartTime(startTime)}
                    </span>
                  );
                }
                return null;
              })()}
            </div>

            <button
              type="button"
              onClick={() => removeVideo(video.id)}
              aria-label="Remove from list"
              className="shrink-0 p-1 text-slate-400 hover:text-rose-400 transition"
              title="Remove from list"
            >
              <TrashIcon />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
