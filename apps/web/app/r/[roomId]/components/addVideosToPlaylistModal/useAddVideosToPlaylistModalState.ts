import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AddVideosToPlaylistModalProps,
  Tab,
  VideoToAdd,
  YouTubeSearchItem,
} from "./types";
import {
  fetchVideoInfo,
  fetchYouTubePlaylist,
  fetchYouTubeSearch,
} from "./api";
import {
  extractVideoInfoFromUrl,
  generateId,
  isYouTubePlaylistUrl,
} from "./utils";
export function useAddVideosToPlaylistModalState(args: {
  isOpen: AddVideosToPlaylistModalProps["isOpen"];
  playlists: AddVideosToPlaylistModalProps["playlists"];
  onAddToPlaylist: AddVideosToPlaylistModalProps["onAddToPlaylist"];
  onCreatePlaylist: AddVideosToPlaylistModalProps["onCreatePlaylist"];
}) {
  const { isOpen, playlists, onAddToPlaylist, onCreatePlaylist } = args;
  const [activeTab, setActiveTab] = useState<Tab>("url");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(
    null,
  );
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<YouTubeSearchItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [videosToAdd, setVideosToAdd] = useState<VideoToAdd[]>([]);
  const [isAddingVideos, setIsAddingVideos] = useState(false);

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
      const data = await fetchYouTubeSearch(q);
      if (!data || typeof data !== "object") {
        setSearchError("Network error while searching.");
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
          "YouTube browsing is not configured (missing YOUTUBE_API_KEY).",
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
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  const handleAddFromUrl = useCallback(async () => {
    const url = urlInput.trim();
    if (!url) {
      setUrlError("Please enter a URL");
      return;
    }

    try {
      new URL(url);
    } catch {
      setUrlError("Please enter a valid URL");
      return;
    }

    setIsLoadingUrl(true);
    setUrlError(null);

    try {
      if (isYouTubePlaylistUrl(url)) {
        const data = await fetchYouTubePlaylist(url);

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

      let finalTitle = "Video";
      let thumbnail: string | null = null;
      let channelTitle: string | null = null;

      try {
        const infoData = await fetchVideoInfo(url);

        if (infoData?.ok) {
          finalTitle = infoData.title;
          thumbnail = infoData.thumbnail;
          channelTitle = infoData.channelTitle;
        } else {
          const { title } = extractVideoInfoFromUrl(url);
          finalTitle = title;
        }
      } catch {
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

  const toggleVideoSelection = useCallback((id: string) => {
    setVideosToAdd((prev) =>
      prev.map((v) => (v.id === id ? { ...v, selected: !v.selected } : v)),
    );
  }, []);

  const updateVideoTitle = useCallback((id: string, title: string) => {
    setVideosToAdd((prev) =>
      prev.map((v) => (v.id === id ? { ...v, title } : v)),
    );
  }, []);

  const removeVideo = useCallback((id: string) => {
    setVideosToAdd((prev) => prev.filter((v) => v.id !== id));
  }, []);

  const selectAll = useCallback(() => {
    setVideosToAdd((prev) => prev.map((v) => ({ ...v, selected: true })));
  }, []);

  const deselectAll = useCallback(() => {
    setVideosToAdd((prev) => prev.map((v) => ({ ...v, selected: false })));
  }, []);

  const clearAll = useCallback(() => {
    setVideosToAdd([]);
  }, []);

  const selectedCount = useMemo(
    () => videosToAdd.filter((v) => v.selected).length,
    [videosToAdd],
  );

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
          video.thumbnail || undefined,
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      setVideosToAdd((prev) => prev.filter((v) => !v.selected));
    } finally {
      setIsAddingVideos(false);
    }
  }, [selectedPlaylistId, videosToAdd, onAddToPlaylist]);

  const handleCreatePlaylist = useCallback(() => {
    if (!newPlaylistName.trim()) return;
    onCreatePlaylist(newPlaylistName.trim());
    setNewPlaylistName("");
    setIsCreatingPlaylist(false);
  }, [newPlaylistName, onCreatePlaylist]);

  return {
    activeTab,
    setActiveTab,
    selectedPlaylistId,
    setSelectedPlaylistId,
    isCreatingPlaylist,
    setIsCreatingPlaylist,
    newPlaylistName,
    setNewPlaylistName,
    urlInput,
    setUrlInput,
    isLoadingUrl,
    urlError,
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    searchError,
    videosToAdd,
    setVideosToAdd,
    isAddingVideos,
    selectedCount,
    runYouTubeSearch,
    handleAddFromUrl,
    handleAddFromSearch,
    toggleVideoSelection,
    updateVideoTitle,
    removeVideo,
    selectAll,
    deselectAll,
    clearAll,
    handleAddToPlaylist,
    handleCreatePlaylist,
  };
}
