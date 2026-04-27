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
    <div className="p-3 bg-black/30 rounded-lg border border-white/10 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-200">
          Playlist Settings
        </h4>
        <button
          type="button"
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
          type="button"
          onClick={onDelete}
          className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition flex items-center gap-1"
        >
          <TrashIcon /> Delete
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="px-3 py-1.5 text-sm bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition"
        >
          Save
        </button>
      </div>
    </div>
  );
}
