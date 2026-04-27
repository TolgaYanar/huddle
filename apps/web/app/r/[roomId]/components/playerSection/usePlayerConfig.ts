import React from "react";

import { getYouTubeStartTime } from "../../lib/video";
import type { RoomPlaybackAnchor } from "../../hooks/activityLog/types";

export function usePlayerConfig(
  normalizedUrl: string,
  roomPlaybackAnchorRef?: React.MutableRefObject<RoomPlaybackAnchor | null>,
) {
  // Extract start time from YouTube URL for embed config (independent of the
  // later YouTube sync state, avoids initialization-order coupling).
  const youTubeStartTimeForConfig = React.useMemo(
    () => getYouTubeStartTime(normalizedUrl),
    [normalizedUrl],
  );

  // Late-joiner support: if the room is already mid-playback when this iframe
  // mounts, derive a start offset from the playback anchor so the iframe
  // loads at the correct timestamp instead of restarting from 0 (which the
  // post-load catchup logic may fail to fix in time, especially on slow
  // YouTube loads).
  const anchorStartSeconds = React.useMemo(() => {
    const anchor = roomPlaybackAnchorRef?.current;
    if (!anchor) return null;
    if (anchor.url !== normalizedUrl) return null;
    const elapsed = anchor.isPlaying
      ? Math.max(0, (Date.now() - anchor.anchorAt) / 1000)
      : 0;
    const target = anchor.anchorTime + elapsed * (anchor.playbackRate || 1);
    if (!Number.isFinite(target) || target <= 1) return null;
    return Math.floor(target);
    // Recompute when the URL changes; the ref's identity is stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedUrl]);

  const startSeconds =
    youTubeStartTimeForConfig && youTubeStartTimeForConfig > 0
      ? youTubeStartTimeForConfig
      : anchorStartSeconds && anchorStartSeconds > 0
        ? anchorStartSeconds
        : null;

  const playerConfig = React.useMemo(() => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : undefined;
    return {
      youtube: {
        playerVars: {
          autoplay: 1,
          // Browsers block unmuted autoplay without a user gesture; mounting
          // muted lets late joiners actually start playing. Volume/mute are
          // driven by React state via the IFrame API after the user interacts.
          mute: 1,
          controls: 1,
          fs: 0,
          rel: 0,
          modestbranding: 1,
          enablejsapi: 1,
          playsinline: 1,
          ...(origin ? { origin } : {}),
          ...(startSeconds ? { start: startSeconds } : {}),
        },
      },
      file: {
        attributes: {
          crossOrigin: "anonymous",
        },
      },
    };
  }, [startSeconds]);

  return { playerConfig };
}
