"use client";

import React from "react";

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

export function VideoSourceCard({
  inputUrl,
  setInputUrl,
  handleUrlChange,
}: {
  inputUrl: string;
  setInputUrl: React.Dispatch<React.SetStateAction<string>>;
  handleUrlChange: (e: React.FormEvent) => void;
}) {
  const [youtubePickerOpen, setYoutubePickerOpen] = React.useState(false);
  const [youtubeQuery, setYoutubeQuery] = React.useState("");
  const [youtubeResults, setYoutubeResults] = React.useState<
    YouTubeSearchItem[]
  >([]);
  const [youtubeLoading, setYoutubeLoading] = React.useState(false);
  const [youtubeError, setYoutubeError] = React.useState<string | null>(null);
  const [pendingYoutubeSelectUrl, setPendingYoutubeSelectUrl] = React.useState<
    string | null
  >(null);

  React.useEffect(() => {
    if (!pendingYoutubeSelectUrl) return;
    if (inputUrl !== pendingYoutubeSelectUrl) return;

    handleUrlChange({ preventDefault() {} } as unknown as React.FormEvent);
    setPendingYoutubeSelectUrl(null);
  }, [pendingYoutubeSelectUrl, inputUrl, handleUrlChange]);

  const runYouTubeSearch = React.useCallback(async () => {
    const q = youtubeQuery.trim();
    if (!q) {
      setYoutubeError("Type something to search.");
      setYoutubeResults([]);
      return;
    }

    setYoutubeLoading(true);
    setYoutubeError(null);

    try {
      const res = await fetch(
        `/api/youtube-search?q=${encodeURIComponent(q)}&maxResults=12`,
        {
          cache: "no-store",
        },
      );

      const data = (await res
        .json()
        .catch(() => null)) as YouTubeSearchResponse | null;

      if (!data || typeof data !== "object") {
        setYoutubeError("Search failed.");
        setYoutubeResults([]);
        return;
      }

      if (data.ok) {
        setYoutubeResults(Array.isArray(data.items) ? data.items : []);
        setYoutubeError(null);
        return;
      }

      if (data.reason === "missing_key") {
        setYoutubeError(
          "YouTube browsing is not configured (missing YOUTUBE_API_KEY).",
        );
        setYoutubeResults([]);
        return;
      }

      if (data.reason === "quota") {
        setYoutubeError("YouTube API quota exceeded. Try again later.");
        setYoutubeResults([]);
        return;
      }

      setYoutubeError("Search failed.");
      setYoutubeResults([]);
    } catch {
      setYoutubeError("Network error while searching.");
      setYoutubeResults([]);
    } finally {
      setYoutubeLoading(false);
    }
  }, [youtubeQuery]);

  return (
    <div className="backdrop-blur-md bg-white/5 rounded-2xl border border-white/10 p-4 sm:p-5">
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <div className="font-semibold text-slate-50">Video source</div>
            <div className="text-xs text-slate-400 mt-1">
              Paste a link (YouTube/Twitch/Kick/Netflix) or a direct file URL
              (MP4/WebM).
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <span className="px-2 py-1 rounded-full text-[11px] border border-white/10 bg-black/20 text-slate-300">
              YouTube
            </span>
            <span className="px-2 py-1 rounded-full text-[11px] border border-white/10 bg-black/20 text-slate-300">
              Twitch
            </span>
            <span className="px-2 py-1 rounded-full text-[11px] border border-white/10 bg-black/20 text-slate-300">
              Kick
            </span>
            <span className="px-2 py-1 rounded-full text-[11px] border border-white/10 bg-black/20 text-slate-300">
              Netflix
            </span>
            <span className="px-2 py-1 rounded-full text-[11px] border border-white/10 bg-black/20 text-slate-300">
              Prime
            </span>
          </div>
        </div>

        <form onSubmit={handleUrlChange} className="flex gap-2 w-full">
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="e.g. youtube.com/watch?v=..., netflix.com/watch/..."
            className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/40 transition"
          />
          <button
            type="button"
            onClick={() => {
              setYoutubePickerOpen((v) => !v);
              setYoutubeError(null);
            }}
            className="h-11 px-4 bg-black/20 hover:bg-black/30 border border-white/10 rounded-xl transition-colors text-sm font-medium text-slate-50"
            title="Search YouTube and load into the room"
          >
            Browse YouTube
          </button>
          <button
            type="button"
            onClick={() => {
              window.open(
                "https://www.youtube.com",
                "_blank",
                "noopener,noreferrer",
              );
            }}
            className="h-11 px-4 bg-black/20 hover:bg-black/30 border border-white/10 rounded-xl transition-colors text-sm font-medium text-slate-50"
            title="Open YouTube in a new tab to pick from your recommendations"
          >
            Open YouTube
          </button>
          <button
            type="submit"
            className="h-11 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors text-sm font-medium text-slate-50"
          >
            Load
          </button>
        </form>

        {youtubePickerOpen && (
          <div className="mt-2 rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={youtubeQuery}
                onChange={(e) => setYoutubeQuery(e.target.value)}
                placeholder="Search YouTube..."
                className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/40 transition"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void runYouTubeSearch();
                  }
                }}
              />
              <button
                type="button"
                onClick={() => void runYouTubeSearch()}
                disabled={youtubeLoading}
                className="h-11 px-4 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:hover:bg-white/5 border border-white/10 rounded-xl transition-colors text-sm font-medium text-slate-50"
              >
                {youtubeLoading ? "Searching..." : "Search"}
              </button>
              <button
                type="button"
                onClick={() => setYoutubePickerOpen(false)}
                className="h-11 px-4 bg-black/20 hover:bg-black/30 border border-white/10 rounded-xl transition-colors text-sm font-medium text-slate-50"
              >
                Close
              </button>
            </div>

            {youtubeError && (
              <div className="mt-2 text-xs text-rose-300">{youtubeError}</div>
            )}

            {youtubeResults.length > 0 && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {youtubeResults.map((it) => (
                  <button
                    key={it.videoId}
                    type="button"
                    onClick={() => {
                      const next = `https://www.youtube.com/watch?v=${it.videoId}`;
                      setPendingYoutubeSelectUrl(next);
                      setInputUrl(next);
                      setYoutubePickerOpen(false);
                    }}
                    className="text-left rounded-xl border border-white/10 bg-black/20 hover:bg-black/30 transition-colors overflow-hidden"
                    title="Select this video"
                  >
                    <div className="aspect-video bg-black/30">
                      {it.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={it.thumbnail}
                          alt={it.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full" />
                      )}
                    </div>
                    <div className="p-2">
                      <div className="text-sm font-semibold text-slate-100 line-clamp-2">
                        {it.title}
                      </div>
                      {it.channelTitle && (
                        <div className="text-xs text-slate-400 mt-1 line-clamp-1">
                          {it.channelTitle}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {youtubeResults.length === 0 &&
              !youtubeLoading &&
              !youtubeError && (
                <div className="mt-2 text-xs text-slate-400">
                  Search and click a video to open the preview. After you
                  confirm, it becomes the room video.
                </div>
              )}
          </div>
        )}
      </div>
    </div>
  );
}
