import type { SyncAction } from "shared-logic";

import type { LogEntry } from "../../types";

export type SendSyncEvent = (
  action: SyncAction,
  timestamp: number,
  videoUrl?: string,
  extra?: {
    volume?: number;
    isMuted?: boolean;
    playbackSpeed?: number;
    audioSyncEnabled?: boolean;
  },
) => void;

export type AddLogEntry = (entry: Omit<LogEntry, "time">) => void;

export interface UseVideoPlayerProps {
  isClient: boolean;
  roomId: string;
  audioSyncEnabled: boolean;
  applyingRemoteSyncRef: React.MutableRefObject<boolean>;
  lastManualSeekRef?: React.MutableRefObject<number>;
  hasInitialSyncRef?: React.MutableRefObject<boolean>;
  sendSyncEvent: SendSyncEvent;
  addLogEntry?: AddLogEntry;
}
