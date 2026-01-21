import { useCallback } from "react";

import type { PlaybackHandlersArgs } from "./types";
import { useHandleDuration } from "./useHandleDuration";
import { useHandlePause } from "./useHandlePause";
import { useHandlePlay } from "./useHandlePlay";
import { useHandleProgress } from "./useHandleProgress";
import { useHandleSeek } from "./useHandleSeek";
import { useHandleSeekFromController } from "./useHandleSeekFromController";
import { useHandleSeekTo } from "./useHandleSeekTo";

export function usePlaybackHandlers(args: PlaybackHandlersArgs) {
  const { state } = args;
  const { suppressPlayBroadcastUntilRef, suppressSeekBroadcastUntilRef } =
    state;

  const handlePlay = useHandlePlay(args);
  const handlePause = useHandlePause(args);
  const handleSeek = useHandleSeek(args);
  const handleSeekTo = useHandleSeekTo(args);
  const handleSeekFromController = useHandleSeekFromController(args);
  const handleProgress = useHandleProgress(args);
  const handleDuration = useHandleDuration(args);

  const suppressNextPlayBroadcast = useCallback(
    (ms: number = 1500) => {
      const until = Date.now() + Math.max(0, ms);
      suppressPlayBroadcastUntilRef.current = Math.max(
        suppressPlayBroadcastUntilRef.current,
        until,
      );
    },
    [suppressPlayBroadcastUntilRef],
  );

  const suppressNextSeekBroadcast = useCallback(
    (ms: number = 2000) => {
      const until = Date.now() + Math.max(0, ms);
      suppressSeekBroadcastUntilRef.current = Math.max(
        suppressSeekBroadcastUntilRef.current,
        until,
      );
    },
    [suppressSeekBroadcastUntilRef],
  );

  return {
    handlePlay,
    handlePause,
    handleSeek,
    handleSeekTo,
    handleSeekFromController,
    handleProgress,
    handleDuration,
    suppressNextPlayBroadcast,
    suppressNextSeekBroadcast,
  };
}
