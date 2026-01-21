import React from "react";

export function useGuardedSendSyncEvent<Args extends unknown[]>(
  rawSendSyncEvent: (...args: Args) => void,
  hasInitialSyncRef: React.RefObject<boolean>,
  mountTimeRef: React.RefObject<number>,
) {
  return React.useCallback(
    (...args: Args) => {
      const action = args[0];
      const playbackActions = ["play", "pause", "seek"];

      if (typeof action === "string" && playbackActions.includes(action)) {
        if (!hasInitialSyncRef.current) return;
        if (Date.now() - (mountTimeRef.current ?? 0) < 200) return;
      }

      rawSendSyncEvent(...args);
    },
    [rawSendSyncEvent, hasInitialSyncRef, mountTimeRef],
  );
}
