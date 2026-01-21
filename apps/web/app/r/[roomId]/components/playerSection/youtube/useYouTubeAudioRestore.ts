import * as React from "react";

import { getInternalPlayerFromRef } from "./internal";

export function useYouTubeAudioRestore({
  isClient,
  isYouTube,
  isPageVisible,
  ytAudioBlockedInBackground,
  setYtAudioBlockedInBackground,
  playerRef,
  effectiveMuted,
  effectiveVolume,
  videoState,
  suppressNextPlayBroadcast,
}: {
  isClient: boolean;
  isYouTube: boolean;
  isPageVisible: boolean;
  ytAudioBlockedInBackground: boolean;
  setYtAudioBlockedInBackground: React.Dispatch<React.SetStateAction<boolean>>;
  playerRef: React.RefObject<unknown>;
  effectiveMuted: boolean;
  effectiveVolume: number;
  videoState: string;
  suppressNextPlayBroadcast: (ms?: number) => void;
}) {
  // When returning to visible, try to immediately restore audio if the browser
  // blocked background unmute on the next item.
  React.useEffect(() => {
    if (!isClient) return;
    if (!isYouTube) return;
    if (!isPageVisible) return;
    if (!ytAudioBlockedInBackground) return;

    const internal = getInternalPlayerFromRef(playerRef);

    try {
      if (!internal) return;
      if (!effectiveMuted && effectiveVolume > 0) {
        internal.unMute?.();
        internal.setVolume?.(
          Math.max(0, Math.min(100, Math.round(effectiveVolume * 100))),
        );
        if (videoState === "Playing") {
          suppressNextPlayBroadcast(2000);
          internal.playVideo?.();
        }
      }
    } catch {
      // ignore
    } finally {
      setYtAudioBlockedInBackground(false);
    }
  }, [
    isClient,
    isYouTube,
    isPageVisible,
    ytAudioBlockedInBackground,
    playerRef,
    effectiveMuted,
    effectiveVolume,
    videoState,
    suppressNextPlayBroadcast,
    setYtAudioBlockedInBackground,
  ]);
}
