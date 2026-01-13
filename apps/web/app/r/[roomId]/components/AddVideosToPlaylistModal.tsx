"use client";

import React, { useState, useCallback, useEffect, useMemo } from "react";
import type { Playlist } from "shared-logic";
import { getYouTubeStartTime, formatStartTime } from "../lib/video";

interface VideoToAdd {
  id: string;
  url: string;
  title: string;
  thumbnail: string | null;
  channelTitle: string | null;
  selected: boolean;
}

interface AddVideosToPlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  playlists: Playlist[];
  onAddToPlaylist: (
    playlistId: string,
    videoUrl: string,
    title: string,
    duration?: number,
    thumbnail?: string
  ) => void;
  onCreatePlaylist: (name: string, description?: string) => void;
}

type YouTubeSearchItem = {
  videoId: string;
  title: string;
  channelTitle: string | null;
  thumbnail: string | null;
};

type YouTubeSearchResponse =
  | { ok: true; items: YouTubeSearchItem[] }
  | {
      ok: false;
      reason:
        | "missing_key"
        | "missing_query"
        | "quota"
        | "youtube_api_error"
        | "network";
    };

type YouTubePlaylistItem = {
  videoId: string;
  title: string;
  channelTitle: string | null;
  thumbnail: string | null;
  position: number;
};

type YouTubePlaylistResponse =
  | { ok: true; playlistTitle: string | null; items: YouTubePlaylistItem[] }
  | {
      ok: false;
      reason:
        | "missing_key"
        | "missing_playlist_id"
        | "quota"
        | "youtube_api_error"
        | "network"
        | "not_found";
    };

type VideoInfoResponse =
  | {
      ok: true;
      title: string;
      thumbnail: string | null;
      channelTitle: string | null;
      duration: number | null;
      isLive: boolean;
    }
  | {
      ok: false;
      reason: string;
    };

const CloseIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
  </svg>
);

const PlusIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
  </svg>
);

const SearchIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
  </svg>
);

const PlaylistIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
  </svg>
);

function generateId(): string {
  return Math.random().toString(36).slice(2, 11);
}

function isYouTubePlaylistUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return (
      (urlObj.hostname.includes("youtube.com") ||
        urlObj.hostname.includes("youtu.be")) &&
      urlObj.searchParams.has("list")
    );
  } catch {
    return false;
  }
}

function extractVideoInfoFromUrl(url: string): {
  title: string;
  videoId?: string;
} {
  try {
    const urlObj = new URL(url);

    // YouTube
    if (
      urlObj.hostname.includes("youtube.com") ||
      urlObj.hostname.includes("youtu.be")
    ) {
      const videoId = urlObj.hostname.includes("youtu.be")
        ? urlObj.pathname.slice(1)
        : urlObj.searchParams.get("v");
      return {
        title: videoId ? `YouTube Video (${videoId})` : "YouTube Video",
        videoId: videoId || undefined,
      };
    }

    // Twitch
    if (urlObj.hostname.includes("twitch.tv")) {
      const pathParts = urlObj.pathname.split("/").filter(Boolean);
      if (pathParts.length > 0) {
        return { title: `Twitch: ${pathParts[0]}` };
      }
      return { title: "Twitch Stream" };
    }

    // Kick
    if (urlObj.hostname.includes("kick.com")) {
      const pathParts = urlObj.pathname.split("/").filter(Boolean);
      if (pathParts.length > 0) {
        return { title: `Kick: ${pathParts[0]}` };
      }
      return { title: "Kick Stream" };
    }

    // Direct video file
    if (/\.(mp4|webm|ogg|m3u8|mkv|avi|mov)$/i.test(urlObj.pathname)) {
      const filename = urlObj.pathname.split("/").pop() || "";
      return { title: filename || "Direct Video" };
    }

    return { title: urlObj.hostname };
  } catch {
    return { title: url.slice(0, 50) };
  }
}

type Tab = "url" | "search";

export function AddVideosToPlaylistModal({
  isOpen,
  onClose,
  playlists,
  onAddToPlaylist,
  onCreatePlaylist,
}: AddVideosToPlaylistModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>("url");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(
    null
  );
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");

  // URL tab state
  const [urlInput, setUrlInput] = useState("");
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  // Search tab state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<YouTubeSearchItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Videos to add (with confirmation)
  const [videosToAdd, setVideosToAdd] = useState<VideoToAdd[]>([]);
  const [isAddingVideos, setIsAddingVideos] = useState(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setSelectedPlaylistId(playlists[0]?.id ?? null);
      setVideosToAdd([]);
      setUrlInput("");
      setSearchQuery("");
      setSearchResults([]);
      setUrlError(null);
      setSearchError(null);
      setIsCreatingPlaylist(false);
      setNewPlaylistName("");
      setActiveTab("url");
    }
  }, [isOpen, playlists]);

  // YouTube search
  const runYouTubeSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchError("Type something to search.");
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    try {
      const res = await fetch(
        `/api/youtube-search?q=${encodeURIComponent(q)}&maxResults=12`,
        { cache: "no-store" }
      );

      const data = (await res
        .json()
        .catch(() => null)) as YouTubeSearchResponse | null;

      if (!data || typeof data !== "object") {
        setSearchError("Search failed.");
        setSearchResults([]);
        return;
      }

      if (data.ok) {
        setSearchResults(Array.isArray(data.items) ? data.items : []);
        setSearchError(null);
        return;
      }

      if (data.reason === "missing_key") {
        setSearchError(
          "YouTube browsing is not configured (missing YOUTUBE_API_KEY)."
        );
        setSearchResults([]);
        return;
      }

      if (data.reason === "quota") {
        setSearchError("YouTube API quota exceeded. Try again later.");
        setSearchResults([]);
        return;
      }

      setSearchError("Search failed.");
      setSearchResults([]);
    } catch {
      setSearchError("Network error while searching.");
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  // Add video from URL (single video or playlist)
  const handleAddFromUrl = useCallback(async () => {
    const url = urlInput.trim();
    if (!url) {
      setUrlError("Please enter a URL");
      return;
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      setUrlError("Please enter a valid URL");
      return;
    }

    setIsLoadingUrl(true);
    setUrlError(null);

    try {
      // Check if it's a YouTube playlist
      if (isYouTubePlaylistUrl(url)) {
        const res = await fetch(
          `/api/youtube-playlist?url=${encodeURIComponent(url)}`,
          { cache: "no-store" }
        );

        const data = (await res
          .json()
          .catch(() => null)) as YouTubePlaylistResponse | null;

        if (!data || typeof data !== "object") {
          setUrlError("Failed to load playlist.");
          return;
        }

        if (data.ok) {
          const newVideos: VideoToAdd[] = data.items.map((item) => ({
            id: generateId(),
            url: `https://www.youtube.com/watch?v=${item.videoId}`,
            title: item.title,
            thumbnail: item.thumbnail,
            channelTitle: item.channelTitle,
            selected: true,
          }));

          setVideosToAdd((prev) => [...prev, ...newVideos]);
          setUrlInput("");
          return;
        }

        if (data.reason === "missing_key") {
          setUrlError("YouTube API not configured.");
          return;
        }

        if (data.reason === "quota") {
          setUrlError("YouTube API quota exceeded.");
          return;
        }

        if (data.reason === "not_found") {
          setUrlError("Playlist not found or is private.");
          return;
        }

        setUrlError("Failed to load playlist.");
        return;
      }

      // Single video - fetch proper metadata using video-info API
      let finalTitle = "Video";
      let thumbnail: string | null = null;
      let channelTitle: string | null = null;

      try {
        const infoRes = await fetch(
          `/api/video-info?url=${encodeURIComponent(url)}`,
          { cache: "no-store" }
        );
        const infoData = (await infoRes
          .json()
          .catch(() => null)) as VideoInfoResponse | null;

        if (infoData?.ok) {
          finalTitle = infoData.title;
          thumbnail = infoData.thumbnail;
          channelTitle = infoData.channelTitle;
        } else {
          // Fallback to basic extraction
          const { title } = extractVideoInfoFromUrl(url);
          finalTitle = title;
        }
      } catch {
        // Fallback to basic extraction
        const { title } = extractVideoInfoFromUrl(url);
        finalTitle = title;
      }

      const newVideo: VideoToAdd = {
        id: generateId(),
        url,
        title: finalTitle,
        thumbnail,
        channelTitle,
        selected: true,
      };

      setVideosToAdd((prev) => [...prev, newVideo]);
      setUrlInput("");
    } catch {
      setUrlError("Failed to process URL.");
    } finally {
      setIsLoadingUrl(false);
    }
  }, [urlInput]);

  // Add video from search results
  const handleAddFromSearch = useCallback((item: YouTubeSearchItem) => {
    const newVideo: VideoToAdd = {
      id: generateId(),
      url: `https://www.youtube.com/watch?v=${item.videoId}`,
      title: item.title,
      thumbnail: item.thumbnail,
      channelTitle: item.channelTitle,
      selected: true,
    };
    setVideosToAdd((prev) => [...prev, newVideo]);
  }, []);

  // Toggle video selection
  const toggleVideoSelection = useCallback((id: string) => {
    setVideosToAdd((prev) =>
      prev.map((v) => (v.id === id ? { ...v, selected: !v.selected } : v))
    );
  }, []);

  // Update video title
  const updateVideoTitle = useCallback((id: string, title: string) => {
    setVideosToAdd((prev) =>
      prev.map((v) => (v.id === id ? { ...v, title } : v))
    );
  }, []);

  // Remove video from list
  const removeVideo = useCallback((id: string) => {
    setVideosToAdd((prev) => prev.filter((v) => v.id !== id));
  }, []);

  // Select/deselect all
  const selectAll = useCallback(() => {
    setVideosToAdd((prev) => prev.map((v) => ({ ...v, selected: true })));
  }, []);

  const deselectAll = useCallback(() => {
    setVideosToAdd((prev) => prev.map((v) => ({ ...v, selected: false })));
  }, []);

  // Add selected videos to playlist
  const handleAddToPlaylist = useCallback(async () => {
    if (!selectedPlaylistId) return;

    const selectedVideos = videosToAdd.filter((v) => v.selected);
    if (selectedVideos.length === 0) return;

    setIsAddingVideos(true);

    try {
      for (const video of selectedVideos) {
        onAddToPlaylist(
          selectedPlaylistId,
          video.url,
          video.title,
          undefined,
          video.thumbnail || undefined
        );
        // Small delay to prevent overwhelming the server
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Remove added videos from the list
      setVideosToAdd((prev) => prev.filter((v) => !v.selected));
    } finally {
      setIsAddingVideos(false);
    }
  }, [selectedPlaylistId, videosToAdd, onAddToPlaylist]);

  // Create new playlist
  const handleCreatePlaylist = useCallback(() => {
    if (!newPlaylistName.trim()) return;
    onCreatePlaylist(newPlaylistName.trim());
    setNewPlaylistName("");
    setIsCreatingPlaylist(false);
  }, [newPlaylistName, onCreatePlaylist]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  const selectedCount = useMemo(
    () => videosToAdd.filter((v) => v.selected).length,
    [videosToAdd]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <PlaylistIcon />
            <h3 className="text-lg font-semibold text-slate-50">
              Add Videos to Playlist
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 transition"
            title="Close modal"
            aria-label="Close modal"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Playlist selector */}
          <div className="p-4 border-b border-white/10 shrink-0">
            <label className="text-sm text-slate-400 mb-2 block">
              Select Playlist
            </label>
            <div className="flex gap-2">
              <select
                value={selectedPlaylistId || ""}
                onChange={(e) => setSelectedPlaylistId(e.target.value || null)}
                className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                title="Select a playlist"
                aria-label="Select a playlist to add videos to"
              >
                {playlists.length === 0 && (
                  <option value="">No playlists yet</option>
                )}
                {playlists.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.items.length} videos)
                  </option>
                ))}
              </select>

              {isCreatingPlaylist ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    placeholder="Playlist name"
                    className="bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleCreatePlaylist()
                    }
                    autoFocus
                  />
                  <button
                    onClick={handleCreatePlaylist}
                    disabled={!newPlaylistName.trim()}
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 rounded-xl text-sm font-medium text-white transition"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => setIsCreatingPlaylist(false)}
                    className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm text-slate-200 transition"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsCreatingPlaylist(true)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium text-slate-200 transition flex items-center gap-2"
                >
                  <PlusIcon />
                  New
                </button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-white/10 shrink-0">
            <button
              onClick={() => setActiveTab("url")}
              className={`flex-1 px-4 py-3 text-sm font-medium transition ${
                activeTab === "url"
                  ? "text-indigo-400 border-b-2 border-indigo-400"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Paste URL / Playlist
            </button>
            <button
              onClick={() => setActiveTab("search")}
              className={`flex-1 px-4 py-3 text-sm font-medium transition ${
                activeTab === "search"
                  ? "text-indigo-400 border-b-2 border-indigo-400"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Search YouTube
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-auto">
            {activeTab === "url" && (
              <div className="p-4 space-y-4">
                <div>
                  <label className="text-sm text-slate-400 mb-2 block">
                    Video or Playlist URL
                  </label>
                  <p className="text-xs text-slate-500 mb-2">
                    Paste a YouTube video URL, YouTube playlist URL, Twitch/Kick
                    stream, or direct video link. YouTube playlists will load
                    all videos for preview.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="https://youtube.com/watch?v=... or playlist?list=..."
                      className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                      onKeyDown={(e) => e.key === "Enter" && handleAddFromUrl()}
                    />
                    <button
                      onClick={handleAddFromUrl}
                      disabled={isLoadingUrl || !urlInput.trim()}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 rounded-xl text-sm font-medium text-white transition flex items-center gap-2"
                    >
                      {isLoadingUrl ? (
                        "Loading..."
                      ) : (
                        <>
                          <PlusIcon />
                          Add
                        </>
                      )}
                    </button>
                  </div>
                  {urlError && (
                    <p className="text-xs text-rose-400 mt-2">{urlError}</p>
                  )}
                </div>
              </div>
            )}

            {activeTab === "search" && (
              <div className="p-4 space-y-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search YouTube..."
                    className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                    onKeyDown={(e) => e.key === "Enter" && runYouTubeSearch()}
                  />
                  <button
                    onClick={runYouTubeSearch}
                    disabled={isSearching}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 rounded-xl text-sm font-medium text-white transition flex items-center gap-2"
                  >
                    {isSearching ? (
                      "Searching..."
                    ) : (
                      <>
                        <SearchIcon />
                        Search
                      </>
                    )}
                  </button>
                </div>

                {searchError && (
                  <p className="text-xs text-rose-400">{searchError}</p>
                )}

                {searchResults.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {searchResults.map((item) => (
                      <button
                        key={item.videoId}
                        type="button"
                        onClick={() => handleAddFromSearch(item)}
                        className="text-left rounded-xl border border-white/10 bg-black/20 hover:bg-black/30 transition-colors overflow-hidden group"
                        title="Click to add to preview"
                      >
                        <div className="aspect-video bg-black/30 relative">
                          {item.thumbnail && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.thumbnail}
                              alt={item.title}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          )}
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <div className="bg-indigo-600 rounded-full p-2">
                              <PlusIcon />
                            </div>
                          </div>
                        </div>
                        <div className="p-2">
                          <div className="text-xs font-medium text-slate-100 line-clamp-2">
                            {item.title}
                          </div>
                          {item.channelTitle && (
                            <div className="text-[10px] text-slate-400 mt-1 line-clamp-1">
                              {item.channelTitle}
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {searchResults.length === 0 && !isSearching && !searchError && (
                  <p className="text-xs text-slate-500 text-center py-4">
                    Search for videos and click to add them to the preview
                    below.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Videos to add preview */}
          {videosToAdd.length > 0 && (
            <div className="border-t border-white/10 shrink-0">
              <div className="flex items-center justify-between p-3 bg-black/20">
                <div className="text-sm font-medium text-slate-200">
                  Videos to Add ({selectedCount} / {videosToAdd.length}{" "}
                  selected)
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={selectAll}
                    className="px-2 py-1 text-xs text-slate-400 hover:text-slate-200 transition"
                  >
                    Select All
                  </button>
                  <button
                    onClick={deselectAll}
                    className="px-2 py-1 text-xs text-slate-400 hover:text-slate-200 transition"
                  >
                    Deselect All
                  </button>
                  <button
                    onClick={() => setVideosToAdd([])}
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
                      onClick={() => toggleVideoSelection(video.id)}
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
                        onChange={(e) =>
                          updateVideoTitle(video.id, e.target.value)
                        }
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
                      onClick={() => removeVideo(video.id)}
                      className="shrink-0 p-1 text-slate-400 hover:text-rose-400 transition"
                      title="Remove from list"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-white/10 bg-black/20 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium text-slate-200 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleAddToPlaylist}
            disabled={
              !selectedPlaylistId || selectedCount === 0 || isAddingVideos
            }
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 rounded-xl text-sm font-medium text-white transition"
          >
            {isAddingVideos
              ? "Adding..."
              : `Add ${selectedCount} Video${selectedCount !== 1 ? "s" : ""} to Playlist`}
          </button>
        </div>
      </div>
    </div>
  );
}
