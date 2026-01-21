import type { Playlist } from "shared-logic";

export interface VideoToAdd {
  id: string;
  url: string;
  title: string;
  thumbnail: string | null;
  channelTitle: string | null;
  selected: boolean;
}

export interface AddVideosToPlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  playlists: Playlist[];
  onAddToPlaylist: (
    playlistId: string,
    videoUrl: string,
    title: string,
    duration?: number,
    thumbnail?: string,
  ) => void;
  onCreatePlaylist: (name: string, description?: string) => void;
}

export type Tab = "url" | "search";

export type YouTubeSearchItem = {
  videoId: string;
  title: string;
  channelTitle: string | null;
  thumbnail: string | null;
};

export type YouTubeSearchResponse =
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

export type YouTubePlaylistItem = {
  videoId: string;
  title: string;
  channelTitle: string | null;
  thumbnail: string | null;
  position: number;
};

export type YouTubePlaylistResponse =
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

export type VideoInfoResponse =
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
