import { useCallback } from "react";

import type { PlaybackHandlersArgs } from "./types";

export function useHandleDuration(args: PlaybackHandlersArgs) {
  const { state } = args;
  const { setDuration } = state;

  return useCallback(
    (dur: number) => {
      setDuration(dur);
    },
    [setDuration],
  );
}
