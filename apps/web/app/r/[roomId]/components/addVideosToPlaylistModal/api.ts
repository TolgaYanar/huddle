import type {
  VideoInfoResponse,
  YouTubePlaylistResponse,
  YouTubeSearchResponse,
} from "./types";

export async function fetchYouTubeSearch(
  q: string,
): Promise<YouTubeSearchResponse | null> {
  try {
    const res = await fetch(
      `/api/youtube-search?q=${encodeURIComponent(q)}&maxResults=12`,
      { cache: "no-store" },
    );

    return (await res.json().catch(() => null)) as YouTubeSearchResponse | null;
  } catch {
    return null;
  }
}

export async function fetchYouTubePlaylist(
  url: string,
): Promise<YouTubePlaylistResponse | null> {
  try {
    const res = await fetch(
      `/api/youtube-playlist?url=${encodeURIComponent(url)}`,
      { cache: "no-store" },
    );

    return (await res
      .json()
      .catch(() => null)) as YouTubePlaylistResponse | null;
  } catch {
    return null;
  }
}

export async function fetchVideoInfo(
  url: string,
): Promise<VideoInfoResponse | null> {
  try {
    const res = await fetch(`/api/video-info?url=${encodeURIComponent(url)}`, {
      cache: "no-store",
    });

    return (await res.json().catch(() => null)) as VideoInfoResponse | null;
  } catch {
    return null;
  }
}
