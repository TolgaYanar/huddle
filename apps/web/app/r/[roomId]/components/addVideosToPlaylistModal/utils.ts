export function generateId(): string {
  return Math.random().toString(36).slice(2, 11);
}

export function isYouTubePlaylistUrl(url: string): boolean {
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

export function extractVideoInfoFromUrl(url: string): {
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
