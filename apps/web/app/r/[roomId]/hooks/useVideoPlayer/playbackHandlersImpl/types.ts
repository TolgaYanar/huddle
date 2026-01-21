import type { AddLogEntry, SendSyncEvent } from "../types";
import type { VideoPlayerState } from "../state";

export type PlaybackHandlersArgs = {
  state: VideoPlayerState;
  url: string;
  duration: number;
  sendSyncEvent: SendSyncEvent;
  addLogEntry?: AddLogEntry;
  hasInitialSyncRef?: React.MutableRefObject<boolean>;
  applyingRemoteSyncRef: React.MutableRefObject<boolean>;
  lastManualSeekRef?: React.MutableRefObject<number>;
};

export type SeekToOpts = { force?: boolean };
