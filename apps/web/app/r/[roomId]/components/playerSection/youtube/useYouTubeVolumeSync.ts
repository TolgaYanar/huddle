import * as React from "react";

import { getInternalPlayerFromRef } from "./internal";

export function useYouTubeVolumeSync({
  isClient,
  isYouTube,
  playerRef,
  effectiveMuted,
  effectiveVolume,
}: {
  isClient: boolean;
  isYouTube: boolean;
  playerRef: React.RefObject<unknown>;
  effectiveMuted: boolean;
  effectiveVolume: number;
}) {
  // ReactPlayer's `muted` / `volume` props are not reliably applied immediately
  // for YouTube across all browser/iframe states. Apply them directly to the
  // internal YouTube player so the UI feels responsive.
  React.useEffect(() => {
    if (!isClient) return;
    if (!isYouTube) return;

    const internal = getInternalPlayerFromRef(playerRef);

    try {
      if (!internal) return;

      if (effectiveMuted || effectiveVolume <= 0) {
        internal.mute?.();
        return;
      }

      internal.unMute?.();
      internal.setVolume?.(
        Math.max(0, Math.min(100, Math.round(effectiveVolume * 100))),
      );
    } catch {
      // ignore
    }
  }, [isClient, isYouTube, playerRef, effectiveMuted, effectiveVolume]);
}
