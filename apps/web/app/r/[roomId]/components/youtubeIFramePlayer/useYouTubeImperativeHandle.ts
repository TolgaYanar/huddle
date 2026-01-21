import React from "react";

import type { YTPlayer, YouTubeIFramePlayerHandle } from "./types";

export function useYouTubeImperativeHandle(
  ref: React.ForwardedRef<YouTubeIFramePlayerHandle>,
  playerRef: React.MutableRefObject<YTPlayer | null>,
) {
  React.useImperativeHandle(
    ref,
    () => ({
      play: async () => {
        try {
          playerRef.current?.playVideo();
        } catch {
          // ignore autoplay/user-gesture errors
        }
      },
      pause: () => {
        try {
          playerRef.current?.pauseVideo();
        } catch {
          // ignore
        }
      },
      seekTo: (seconds: number) => {
        const player = playerRef.current;
        if (!player || typeof player.seekTo !== "function") {
          console.log(`[YT-IFRAME] seekTo skipped - player not ready`);
          return;
        }
        try {
          player.seekTo(seconds, true);
        } catch (err) {
          console.error(`[YT-IFRAME] seekTo error:`, err);
        }
      },
      getCurrentTime: () => {
        try {
          const t = playerRef.current?.getCurrentTime?.();
          return typeof t === "number" && Number.isFinite(t) ? t : 0;
        } catch {
          return 0;
        }
      },
      getDuration: () => {
        try {
          const d = playerRef.current?.getDuration?.();
          return typeof d === "number" && Number.isFinite(d) ? d : 0;
        } catch {
          return 0;
        }
      },
      getInternalPlayer: () => playerRef.current,
    }),
    [playerRef],
  );
}
