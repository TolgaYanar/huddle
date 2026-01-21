import React from "react";

import {
  getHtmlMediaElementFromRef,
  pauseFromRef,
  playFromRef,
} from "../../lib/player";

export function useDirectFileElementSync({
  isDirectFile,
  playerRef,
  effectiveMuted,
  effectiveVolume,
  playbackRate,
  videoState,
}: {
  isDirectFile: boolean;
  playerRef: React.RefObject<unknown>;
  effectiveMuted: boolean;
  effectiveVolume: number;
  playbackRate: number;
  videoState: string;
}) {
  React.useEffect(() => {
    if (!isDirectFile) return;

    const el = getHtmlMediaElementFromRef(playerRef);
    if (el) {
      try {
        el.muted = effectiveMuted;
        // Keep volume in sync when unmuted.
        if (!effectiveMuted) el.volume = effectiveVolume;
        el.playbackRate = playbackRate;
      } catch {
        // ignore
      }
    }

    if (videoState === "Playing") {
      void playFromRef(playerRef);
    } else {
      pauseFromRef(playerRef);
    }
  }, [
    isDirectFile,
    playerRef,
    effectiveMuted,
    effectiveVolume,
    playbackRate,
    videoState,
  ]);
}
