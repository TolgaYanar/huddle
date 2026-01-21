import React from "react";

import { getYouTubeStartTime } from "../../lib/video";

export function usePlayerConfig(normalizedUrl: string) {
  // Extract start time from YouTube URL for embed config (independent of the
  // later YouTube sync state, avoids initialization-order coupling).
  const youTubeStartTimeForConfig = React.useMemo(
    () => getYouTubeStartTime(normalizedUrl),
    [normalizedUrl],
  );

  const playerConfig = React.useMemo(() => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : undefined;
    return {
      youtube: {
        playerVars: {
          autoplay: 1,
          controls: 1,
          fs: 0,
          rel: 0,
          modestbranding: 1,
          enablejsapi: 1,
          playsinline: 1,
          ...(origin ? { origin } : {}),
          // Start at the specified time if provided in the URL
          ...(youTubeStartTimeForConfig && youTubeStartTimeForConfig > 0
            ? { start: youTubeStartTimeForConfig }
            : {}),
        },
      },
      file: {
        attributes: {
          crossOrigin: "anonymous",
        },
      },
    };
  }, [youTubeStartTimeForConfig]);

  return { playerConfig };
}
