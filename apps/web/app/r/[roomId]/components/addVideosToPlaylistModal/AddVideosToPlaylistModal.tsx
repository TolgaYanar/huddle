"use client";

import React, { useCallback } from "react";

import { Modal } from "../../../../components/Modal";
import { CloseIcon, PlusIcon, PlaylistIcon, SearchIcon } from "./icons";
import { PlaylistSelector } from "./PlaylistSelector";
import { VideosToAddPreview } from "./VideosToAddPreview";
import type { AddVideosToPlaylistModalProps, YouTubeSearchItem } from "./types";
import { useAddVideosToPlaylistModalState } from "./useAddVideosToPlaylistModalState";

export function AddVideosToPlaylistModal(props: AddVideosToPlaylistModalProps) {
  const { isOpen, onClose, playlists } = props;

  const state = useAddVideosToPlaylistModalState({
    isOpen,
    playlists,
    onAddToPlaylist: props.onAddToPlaylist,
    onCreatePlaylist: props.onCreatePlaylist,
  });

  const handleAddFromSearch = useCallback(
    (item: YouTubeSearchItem) => state.handleAddFromSearch(item),
    [state],
  );

  const titleId = "add-videos-to-playlist-title";

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      labelledBy={titleId}
      panelClassName="bg-surface border border-hairline rounded-[var(--radius-panel)] shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between p-4 border-b border-hairline shrink-0">
        <div className="flex items-center gap-3">
          <PlaylistIcon />
          <h3 id={titleId} className="text-lg font-semibold text-ink">
            Add Videos to Playlist
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-ink-muted hover:text-ink transition"
          title="Close modal"
          aria-label="Close modal"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <PlaylistSelector
          playlists={playlists}
          selectedPlaylistId={state.selectedPlaylistId}
          setSelectedPlaylistId={state.setSelectedPlaylistId}
          isCreatingPlaylist={state.isCreatingPlaylist}
          setIsCreatingPlaylist={state.setIsCreatingPlaylist}
          newPlaylistName={state.newPlaylistName}
          setNewPlaylistName={state.setNewPlaylistName}
          handleCreatePlaylist={state.handleCreatePlaylist}
        />

        <div className="flex border-b border-hairline shrink-0">
          <button
            type="button"
            onClick={() => state.setActiveTab("url")}
            className={`flex-1 px-4 py-3 text-sm font-medium transition ${
              state.activeTab === "url"
                ? "text-indigo-400 border-b-2 border-indigo-400"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            Paste URL / Playlist
          </button>
          <button
            type="button"
            onClick={() => state.setActiveTab("search")}
            className={`flex-1 px-4 py-3 text-sm font-medium transition ${
              state.activeTab === "search"
                ? "text-indigo-400 border-b-2 border-indigo-400"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            Search YouTube
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {state.activeTab === "url" && (
            <div className="p-4 space-y-4">
              <div>
                <label className="text-sm text-ink-muted mb-2 block">
                  Video or Playlist URL
                </label>
                <p className="text-xs text-ink-faint mb-2">
                  Paste a YouTube video URL, YouTube playlist URL, Twitch/Kick
                  stream, or direct video link. YouTube playlists will load all
                  videos for preview.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={state.urlInput}
                    onChange={(e) => state.setUrlInput(e.target.value)}
                    placeholder="https://youtube.com/watch?v=... or playlist?list=..."
                    className="flex-1 bg-sunken border border-hairline rounded-[var(--radius-control)] px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent"
                    onKeyDown={(e) =>
                      e.key === "Enter" && state.handleAddFromUrl()
                    }
                  />
                  <button
                    type="button"
                    onClick={state.handleAddFromUrl}
                    disabled={state.isLoadingUrl || !state.urlInput.trim()}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 rounded-[var(--radius-control)] text-sm font-medium text-white transition flex items-center gap-2"
                  >
                    {state.isLoadingUrl ? (
                      "Loading..."
                    ) : (
                      <>
                        <PlusIcon />
                        Add
                      </>
                    )}
                  </button>
                </div>
                {state.urlError && (
                  <p className="text-xs text-negative mt-2">{state.urlError}</p>
                )}
              </div>
            </div>
          )}

          {state.activeTab === "search" && (
            <div className="p-4 space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={state.searchQuery}
                  onChange={(e) => state.setSearchQuery(e.target.value)}
                  placeholder="Search YouTube..."
                  className="flex-1 bg-sunken border border-hairline rounded-[var(--radius-control)] px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent"
                  onKeyDown={(e) =>
                    e.key === "Enter" && state.runYouTubeSearch()
                  }
                />
                <button
                  type="button"
                  onClick={state.runYouTubeSearch}
                  disabled={state.isSearching}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 rounded-[var(--radius-control)] text-sm font-medium text-white transition flex items-center gap-2"
                >
                  {state.isSearching ? (
                    "Searching..."
                  ) : (
                    <>
                      <SearchIcon />
                      Search
                    </>
                  )}
                </button>
              </div>

              {state.searchError && (
                <p className="text-xs text-negative">{state.searchError}</p>
              )}

              {state.searchResults.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {state.searchResults.map((item) => (
                    <button
                      key={item.videoId}
                      type="button"
                      onClick={() => handleAddFromSearch(item)}
                      className="text-left rounded-[var(--radius-control)] border border-hairline bg-sunken hover:bg-sunken transition-colors overflow-hidden group"
                      title="Click to add to preview"
                    >
                      <div className="aspect-video bg-sunken relative">
                        {item.thumbnail && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.thumbnail}
                            alt={item.title}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        )}
                        <div className="absolute inset-0 bg-sunken opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <div className="bg-indigo-600 rounded-full p-2">
                            <PlusIcon />
                          </div>
                        </div>
                      </div>
                      <div className="p-2">
                        <div className="text-xs font-medium text-ink line-clamp-2">
                          {item.title}
                        </div>
                        {item.channelTitle && (
                          <div className="text-[10px] text-ink-muted mt-1 line-clamp-1">
                            {item.channelTitle}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {state.searchResults.length === 0 &&
                !state.isSearching &&
                !state.searchError && (
                  <p className="text-xs text-ink-faint text-center py-4">
                    Search for videos and click to add them to the preview
                    below.
                  </p>
                )}
            </div>
          )}
        </div>

        <VideosToAddPreview
          videosToAdd={state.videosToAdd}
          selectedCount={state.selectedCount}
          selectAll={state.selectAll}
          deselectAll={state.deselectAll}
          clearAll={state.clearAll}
          toggleVideoSelection={state.toggleVideoSelection}
          updateVideoTitle={state.updateVideoTitle}
          removeVideo={state.removeVideo}
        />
      </div>

      <div className="flex items-center justify-between p-4 border-t border-hairline bg-sunken shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 bg-surface hover:bg-raised border border-hairline rounded-[var(--radius-control)] text-sm font-medium text-ink transition"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={state.handleAddToPlaylist}
          disabled={
            !state.selectedPlaylistId ||
            state.selectedCount === 0 ||
            state.isAddingVideos
          }
          className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 rounded-[var(--radius-control)] text-sm font-medium text-white transition"
        >
          {state.isAddingVideos
            ? "Adding..."
            : `Add ${state.selectedCount} Video${state.selectedCount !== 1 ? "s" : ""} to Playlist`}
        </button>
      </div>
    </Modal>
  );
}
