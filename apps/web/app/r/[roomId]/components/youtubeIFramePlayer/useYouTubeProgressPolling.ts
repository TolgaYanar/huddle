import React from "react";

import type { YouTubeIFrameLatest } from "./internalTypes";
import type { YTPlayer } from "./types";

export function useYouTubeProgressPolling({
  playerRef,
  latest,
  enabled,
}: {
  playerRef: React.MutableRefObject<YTPlayer | null>;
  latest: React.MutableRefObject<YouTubeIFrameLatest>;
  enabled: boolean;
}) {
  React.useEffect(() => {
    if (!enabled) return;

    let t: number | null = null;
    const tick = () => {
      const player = playerRef.current;
      if (!player) return;
      try {
        const time = player.getCurrentTime();
        if (typeof time === "number" && Number.isFinite(time)) {
          latest.current.onProgress?.(time);
        }
        const dur = player.getDuration();
        if (typeof dur === "number" && Number.isFinite(dur) && dur > 0) {
          latest.current.onDuration?.(dur);
        }
      } catch {
        // ignore
      }
    };

    t = window.setInterval(tick, 500);
    return () => {
      if (t) window.clearInterval(t);
    };
  }, [enabled, playerRef, latest]);
}
