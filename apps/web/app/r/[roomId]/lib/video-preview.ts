// Video metadata preview utilities

export interface VideoPreview {
  url: string;
  title: string;
  thumbnail: string | null;
  duration: string | null;
  platform: "youtube" | "vimeo" | "direct" | "unknown";
}

export async function fetchVideoPreview(
  url: string
): Promise<VideoPreview | null> {
  try {
    const normalized = url.trim();
    if (!normalized) return null;

    // YouTube
    const ytMatch = normalized.match(
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/
    );
    if (ytMatch) {
      const videoId = ytMatch[1];

      // Best effort: ask our server for title + duration using YouTube Data API.
      // If quota is exceeded (or any other failure), we silently fall back.
      try {
        const res = await fetch(
          `/api/youtube-preview?url=${encodeURIComponent(normalized)}`,
          { cache: "no-store" }
        );
        const data = await res.json().catch(() => null);
        if (data && data.ok) {
          const durationSeconds =
            typeof data.durationSeconds === "number"
              ? data.durationSeconds
              : null;
          return {
            url: normalized,
            title:
              typeof data.title === "string" ? data.title : "YouTube Video",
            thumbnail:
              typeof data.thumbnail === "string" && data.thumbnail
                ? data.thumbnail
                : `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
            duration:
              typeof durationSeconds === "number"
                ? formatDuration(durationSeconds)
                : null,
            platform: "youtube",
          };
        }
      } catch {
        // ignore
      }

      return {
        url: normalized,
        title: `YouTube Video`,
        thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        duration: null,
        platform: "youtube",
      };
    }

    // Vimeo
    const vimeoMatch = normalized.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) {
      const videoId = vimeoMatch[1];
      try {
        const res = await fetch(
          `https://vimeo.com/api/v2/video/${videoId}.json`
        );
        if (res.ok) {
          const data = await res.json();
          const video = data[0];
          return {
            url: normalized,
            title: video?.title || "Vimeo Video",
            thumbnail: video?.thumbnail_large || null,
            duration: video?.duration ? formatDuration(video.duration) : null,
            platform: "vimeo",
          };
        }
      } catch {
        // fallback
      }
      return {
        url: normalized,
        title: "Vimeo Video",
        thumbnail: null,
        duration: null,
        platform: "vimeo",
      };
    }

    // Direct video URL (mp4, webm, etc.)
    if (
      /\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(normalized) ||
      normalized.includes("/media/")
    ) {
      const filename = normalized.split("/").pop()?.split("?")[0] || "Video";

      // Best-effort duration detection: only works when the server hosting the video
      // allows cross-origin metadata requests.
      const seconds = await probeVideoDurationSeconds(normalized);

      return {
        url: normalized,
        title: filename,
        thumbnail: null,
        duration: typeof seconds === "number" ? formatDuration(seconds) : null,
        platform: "direct",
      };
    }

    // Unknown/other
    return {
      url: normalized,
      title: "Video",
      thumbnail: null,
      duration: null,
      platform: "unknown",
    };
  } catch {
    return null;
  }
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

async function probeVideoDurationSeconds(url: string): Promise<number | null> {
  // This runs in the browser (RoomClient is a client component). Guard for safety.
  if (typeof window === "undefined") return null;
  if (typeof document === "undefined") return null;

  return new Promise((resolve) => {
    let done = false;
    const finish = (value: number | null) => {
      if (done) return;
      done = true;
      try {
        cleanup();
      } catch {
        // ignore
      }
      resolve(value);
    };

    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";

    const timeoutId = window.setTimeout(() => finish(null), 2500);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onError);
      try {
        video.src = "";
        video.load();
      } catch {
        // ignore
      }
    };

    const onLoaded = () => {
      const d = video.duration;
      if (typeof d === "number" && isFinite(d) && d > 0) finish(d);
      else finish(null);
    };

    const onError = () => finish(null);

    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("error", onError);

    try {
      video.src = url;
    } catch {
      finish(null);
    }
  });
}
