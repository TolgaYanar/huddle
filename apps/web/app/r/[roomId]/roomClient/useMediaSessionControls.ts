import { useEffect } from "react";

type PlaylistItemLike = {
  title?: string;
  videoUrl?: string;
  thumbnail?: string;
};

type PlaylistLike = {
  name?: string;
  items?: PlaylistItemLike[];
};

export function useMediaSessionControls(options: {
  isClient: boolean;
  activePlaylist: PlaylistLike | null | undefined;
  currentItemIndex: number;
  videoState: string;
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
}) {
  const {
    isClient,
    activePlaylist,
    currentItemIndex,
    videoState,
    onPlay,
    onPause,
    onNext,
    onPrevious,
  } = options;

  useEffect(() => {
    if (!isClient) return;
    if (typeof navigator === "undefined") return;

    const mediaSession = (
      navigator as unknown as { mediaSession?: MediaSession }
    ).mediaSession;
    if (!mediaSession) return;

    const currentItem = activePlaylist?.items?.[currentItemIndex];
    const title = currentItem?.title || currentItem?.videoUrl || "Huddle";
    const artworkUrl = currentItem?.thumbnail;

    try {
      mediaSession.metadata = new MediaMetadata({
        title,
        artist: activePlaylist?.name || "Playlist",
        album: "Huddle",
        ...(artworkUrl
          ? {
              artwork: [
                { src: artworkUrl, sizes: "96x96", type: "image/png" },
                { src: artworkUrl, sizes: "192x192", type: "image/png" },
                { src: artworkUrl, sizes: "512x512", type: "image/png" },
              ],
            }
          : {}),
      });
    } catch {
      // Some browsers are picky about MediaMetadata/artwork.
    }

    mediaSession.playbackState =
      videoState === "Playing" ? "playing" : "paused";

    const safeSetHandler = (
      action: MediaSessionAction,
      handler: (() => void) | null,
    ) => {
      try {
        mediaSession.setActionHandler(action, handler);
      } catch {
        // Unsupported action on this browser.
      }
    };

    safeSetHandler("play", () => onPlay());
    safeSetHandler("pause", () => onPause());
    safeSetHandler("nexttrack", () => onNext());
    safeSetHandler("previoustrack", () => onPrevious());

    return () => {
      safeSetHandler("play", null);
      safeSetHandler("pause", null);
      safeSetHandler("nexttrack", null);
      safeSetHandler("previoustrack", null);
    };
  }, [
    isClient,
    activePlaylist,
    currentItemIndex,
    videoState,
    onPlay,
    onPause,
    onNext,
    onPrevious,
  ]);
}
