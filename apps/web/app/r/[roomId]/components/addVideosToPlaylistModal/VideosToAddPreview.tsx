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
    <div className="border-t border-hairline shrink-0">
      <div className="flex items-center justify-between p-3 bg-sunken">
        <div className="text-sm font-medium text-ink">
          Videos to Add ({selectedCount} / {videosToAdd.length} selected)
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={selectAll}
            className="px-2 py-1 text-xs text-ink-muted hover:text-ink transition"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={deselectAll}
            className="px-2 py-1 text-xs text-ink-muted hover:text-ink transition"
          >
            Deselect All
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="px-2 py-1 text-xs text-negative hover:text-negative transition"
          >
            Clear All
          </button>
        </div>
      </div>
      <div className="max-h-48 overflow-y-auto p-2 space-y-2">
        {videosToAdd.map((video) => (
          <div
            key={video.id}
            className={`flex items-center gap-3 p-2 rounded-[var(--radius-control)] border transition ${
              video.selected
                ? "border-accent bg-accent-soft"
                : "border-hairline bg-sunken opacity-60"
            }`}
          >
            <button
              type="button"
              onClick={() => toggleVideoSelection(video.id)}
              aria-label={video.selected ? "Deselect video" : "Select video"}
              aria-pressed={video.selected ? "true" : "false"}
              className={`shrink-0 w-5 h-5 rounded border flex items-center justify-center transition ${
                video.selected
                  ? "bg-accent border-accent text-accent-ink"
                  : "border-hairline-strong hover:border-white/40"
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
                className="w-full bg-transparent text-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent rounded px-1"
                title="Edit title"
              />
              {(() => {
                const startTime = getYouTubeStartTime(video.url);
                if (startTime && startTime > 0) {
                  return (
                    <span className="text-[10px] text-accent px-1">
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
              className="shrink-0 p-1 text-ink-muted hover:text-negative transition"
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
