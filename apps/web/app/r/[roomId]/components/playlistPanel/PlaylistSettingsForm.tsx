import React, { useState } from "react";

import { CloseIcon, TrashIcon } from "./icons";
import type { PlaylistSettingsFormProps } from "./types";

export function PlaylistSettingsForm({
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
    <div className="p-3 bg-sunken rounded-[var(--radius-control)] border border-hairline space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-ink">Playlist Settings</h4>
        <button
          type="button"
          onClick={onClose}
          className="text-ink-muted hover:text-ink"
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
        className="w-full bg-sunken border border-hairline rounded-[var(--radius-control)] px-3 py-2 text-sm text-ink placeholder:text-ink0 focus:outline-none focus:ring-2 focus:ring-sky-500/25"
      />

      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)..."
        className="w-full bg-sunken border border-hairline rounded-[var(--radius-control)] px-3 py-2 text-sm text-ink placeholder:text-ink0 focus:outline-none focus:ring-2 focus:ring-sky-500/25"
      />

      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={loop}
            onChange={(e) => setLoop(e.target.checked)}
            className="w-4 h-4 rounded bg-sunken border-hairline-strong text-sky-500 focus:ring-sky-500/25"
          />
          <span className="text-sm text-ink-muted">Loop playlist</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={shuffle}
            onChange={(e) => setShuffle(e.target.checked)}
            className="w-4 h-4 rounded bg-sunken border-hairline-strong text-sky-500 focus:ring-sky-500/25"
          />
          <span className="text-sm text-ink-muted">Shuffle</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={autoPlay}
            onChange={(e) => setAutoPlay(e.target.checked)}
            className="w-4 h-4 rounded bg-sunken border-hairline-strong text-sky-500 focus:ring-sky-500/25"
          />
          <span className="text-sm text-ink-muted">Auto-play next</span>
        </label>
      </div>

      <div className="flex gap-2 justify-between pt-2 border-t border-hairline">
        <button
          type="button"
          onClick={onDelete}
          className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-[var(--radius-control)] transition flex items-center gap-1"
        >
          <TrashIcon /> Delete
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="px-3 py-1.5 text-sm bg-sky-600 hover:bg-accent text-white rounded-[var(--radius-control)] transition"
        >
          Save
        </button>
      </div>
    </div>
  );
}
