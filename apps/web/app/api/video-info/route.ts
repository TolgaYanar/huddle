import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

// Parse YouTube video ID from various URL formats
function extractYouTubeVideoId(url: string): string | null {
  try {
    const urlObj = new URL(url);

    // youtu.be/VIDEO_ID
    if (urlObj.hostname === "youtu.be") {
      return urlObj.pathname.slice(1).split(/[?&#]/)[0] || null;
    }

    // youtube.com/watch?v=VIDEO_ID
    if (urlObj.hostname.includes("youtube.com")) {
      // /watch?v=VIDEO_ID
      const vParam = urlObj.searchParams.get("v");
      if (vParam) return vParam;

      // /embed/VIDEO_ID
      const embedMatch = urlObj.pathname.match(/\/embed\/([^/?&#]+)/);
      if (embedMatch) return embedMatch[1] ?? null;

      // /v/VIDEO_ID
      const vMatch = urlObj.pathname.match(/\/v\/([^/?&#]+)/);
      if (vMatch) return vMatch[1] ?? null;

      // /shorts/VIDEO_ID
      const shortsMatch = urlObj.pathname.match(/\/shorts\/([^/?&#]+)/);
      if (shortsMatch) return shortsMatch[1] ?? null;

      // /live/VIDEO_ID
      const liveMatch = urlObj.pathname.match(/\/live\/([^/?&#]+)/);
      if (liveMatch) return liveMatch[1] ?? null;
    }

    return null;
  } catch {
    return null;
  }
}

// Extract Twitch channel/video info from URL
function extractTwitchInfo(
  url: string
): { type: "channel" | "video" | "clip"; id: string } | null {
  try {
    const urlObj = new URL(url);
    if (!urlObj.hostname.includes("twitch.tv")) return null;

    const pathParts = urlObj.pathname.split("/").filter(Boolean);

    // twitch.tv/videos/VIDEO_ID
    if (pathParts[0] === "videos" && pathParts[1]) {
      return { type: "video", id: pathParts[1] };
    }

    // twitch.tv/CHANNEL/clip/CLIP_ID or clips.twitch.tv
    if (pathParts[1] === "clip" && pathParts[2]) {
      return { type: "clip", id: pathParts[2] };
    }

    // twitch.tv/CHANNEL
    if (pathParts[0] && pathParts[0] !== "directory") {
      return { type: "channel", id: pathParts[0] };
    }

    return null;
  } catch {
    return null;
  }
}

// Extract Kick channel from URL
function extractKickChannel(url: string): string | null {
  try {
    const urlObj = new URL(url);
    if (!urlObj.hostname.includes("kick.com")) return null;

    const pathParts = urlObj.pathname.split("/").filter(Boolean);
    if (pathParts[0] && !["categories", "browse"].includes(pathParts[0])) {
      return pathParts[0];
    }

    return null;
  } catch {
    return null;
  }
}

// Parse ISO 8601 duration (PT1H2M3S) to seconds
function parseYouTubeDuration(duration: string): number | null {
  if (!duration) return null;

  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;

  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);

  return hours * 3600 + minutes * 60 + seconds;
}

async function getYouTubeVideoInfo(
  videoId: string
): Promise<VideoInfoResponse> {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    // Fallback: Use oEmbed API (doesn't require API key)
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
      const res = await fetch(oembedUrl, { cache: "no-store" });

      if (res.ok) {
        const data = await res.json();
        return {
          ok: true,
          title: data.title || `YouTube Video (${videoId})`,
          thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          channelTitle: data.author_name || null,
          duration: null,
          isLive: false,
        };
      }
    } catch {
      // Fall through to default
    }

    return {
      ok: true,
      title: `YouTube Video (${videoId})`,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      channelTitle: null,
      duration: null,
      isLive: false,
    };
  }

  try {
    const endpoint = new URL("https://www.googleapis.com/youtube/v3/videos");
    endpoint.searchParams.set(
      "part",
      "snippet,contentDetails,liveStreamingDetails"
    );
    endpoint.searchParams.set("id", videoId);
    endpoint.searchParams.set("key", apiKey);

    const res = await fetch(endpoint.toString(), { cache: "no-store" });
    const body: unknown = await res.json().catch(() => null);

    if (!res.ok || !isRecord(body)) {
      return {
        ok: true,
        title: `YouTube Video (${videoId})`,
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        channelTitle: null,
        duration: null,
        isLive: false,
      };
    }

    const items = body.items;
    if (!Array.isArray(items) || items.length === 0) {
      return { ok: false, reason: "video_not_found" };
    }

    const item = items[0];
    if (!isRecord(item)) {
      return { ok: false, reason: "invalid_response" };
    }

    const snippet = isRecord(item.snippet) ? item.snippet : null;
    const contentDetails = isRecord(item.contentDetails)
      ? item.contentDetails
      : null;
    const liveDetails = isRecord(item.liveStreamingDetails)
      ? item.liveStreamingDetails
      : null;

    const title =
      snippet && typeof snippet.title === "string"
        ? snippet.title
        : `YouTube Video (${videoId})`;

    const channelTitle =
      snippet && typeof snippet.channelTitle === "string"
        ? snippet.channelTitle
        : null;

    // Get best thumbnail
    let thumbnail: string | null =
      `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    if (snippet && isRecord(snippet.thumbnails)) {
      const thumbs = snippet.thumbnails as Record<string, unknown>;
      for (const key of ["maxres", "standard", "high", "medium", "default"]) {
        if (isRecord(thumbs[key]) && typeof thumbs[key].url === "string") {
          thumbnail = thumbs[key].url as string;
          break;
        }
      }
    }

    const durationStr =
      contentDetails && typeof contentDetails.duration === "string"
        ? contentDetails.duration
        : null;
    const duration = durationStr ? parseYouTubeDuration(durationStr) : null;

    const isLive = liveDetails !== null && !liveDetails.actualEndTime;

    return {
      ok: true,
      title,
      thumbnail,
      channelTitle,
      duration,
      isLive,
    };
  } catch {
    return {
      ok: true,
      title: `YouTube Video (${videoId})`,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      channelTitle: null,
      duration: null,
      isLive: false,
    };
  }
}

async function getTwitchInfo(info: {
  type: "channel" | "video" | "clip";
  id: string;
}): Promise<VideoInfoResponse> {
  // For Twitch, we'll return basic info - full API integration would require OAuth
  const { type, id } = info;

  if (type === "channel") {
    return {
      ok: true,
      title: `${id} on Twitch`,
      thumbnail: null, // Would need Twitch API for actual thumbnail
      channelTitle: id,
      duration: null,
      isLive: true, // Assume live for channels
    };
  }

  if (type === "video") {
    return {
      ok: true,
      title: `Twitch VOD ${id}`,
      thumbnail: null,
      channelTitle: null,
      duration: null,
      isLive: false,
    };
  }

  if (type === "clip") {
    return {
      ok: true,
      title: `Twitch Clip ${id}`,
      thumbnail: null,
      channelTitle: null,
      duration: null,
      isLive: false,
    };
  }

  return { ok: false, reason: "unknown_twitch_type" };
}

async function getKickInfo(channel: string): Promise<VideoInfoResponse> {
  // Try to fetch channel info from Kick's public API
  try {
    const res = await fetch(`https://kick.com/api/v1/channels/${channel}`, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    if (res.ok) {
      const data: unknown = await res.json().catch(() => null);

      if (isRecord(data)) {
        const title =
          typeof data.user === "object" &&
          data.user !== null &&
          "username" in data.user
            ? `${(data.user as { username: string }).username} on Kick`
            : `${channel} on Kick`;

        const thumbnail =
          typeof data.user === "object" &&
          data.user !== null &&
          "profile_pic" in data.user
            ? (data.user as { profile_pic: string }).profile_pic
            : null;

        const isLive =
          typeof data.livestream === "object" && data.livestream !== null;

        let streamTitle = title;
        if (
          isLive &&
          isRecord(data.livestream) &&
          typeof data.livestream.session_title === "string"
        ) {
          streamTitle = data.livestream.session_title;
        }

        let streamThumbnail = thumbnail;
        if (
          isLive &&
          isRecord(data.livestream) &&
          typeof data.livestream.thumbnail === "object"
        ) {
          const thumbObj = data.livestream.thumbnail as Record<string, unknown>;
          if (typeof thumbObj.url === "string") {
            streamThumbnail = thumbObj.url;
          }
        }

        return {
          ok: true,
          title: streamTitle,
          thumbnail: streamThumbnail,
          channelTitle: channel,
          duration: null,
          isLive,
        };
      }
    }
  } catch {
    // Fall through to default
  }

  return {
    ok: true,
    title: `${channel} on Kick`,
    thumbnail: null,
    channelTitle: channel,
    duration: null,
    isLive: true,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = (searchParams.get("url") ?? "").trim();

  if (!url) {
    return NextResponse.json<VideoInfoResponse>(
      { ok: false, reason: "missing_url" },
      { status: 400 }
    );
  }

  // Check YouTube
  const youtubeVideoId = extractYouTubeVideoId(url);
  if (youtubeVideoId) {
    const info = await getYouTubeVideoInfo(youtubeVideoId);
    return NextResponse.json<VideoInfoResponse>(info);
  }

  // Check Twitch
  const twitchInfo = extractTwitchInfo(url);
  if (twitchInfo) {
    const info = await getTwitchInfo(twitchInfo);
    return NextResponse.json<VideoInfoResponse>(info);
  }

  // Check Kick
  const kickChannel = extractKickChannel(url);
  if (kickChannel) {
    const info = await getKickInfo(kickChannel);
    return NextResponse.json<VideoInfoResponse>(info);
  }

  // Unknown platform - return generic info
  try {
    const urlObj = new URL(url);

    // Check if it's a direct video file
    if (/\.(mp4|webm|ogg|m3u8|mkv|avi|mov)$/i.test(urlObj.pathname)) {
      const filename = urlObj.pathname.split("/").pop() || "Direct Video";
      return NextResponse.json<VideoInfoResponse>({
        ok: true,
        title: decodeURIComponent(filename),
        thumbnail: null,
        channelTitle: null,
        duration: null,
        isLive: false,
      });
    }

    return NextResponse.json<VideoInfoResponse>({
      ok: true,
      title: urlObj.hostname + urlObj.pathname,
      thumbnail: null,
      channelTitle: null,
      duration: null,
      isLive: false,
    });
  } catch {
    return NextResponse.json<VideoInfoResponse>(
      { ok: false, reason: "invalid_url" },
      { status: 400 }
    );
  }
}
