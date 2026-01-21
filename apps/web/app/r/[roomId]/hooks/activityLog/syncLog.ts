import type { SyncData } from "shared-logic";

import type { LogEntry } from "../../types";
import { formatTime } from "../../lib/activity";
import { getUserDisplayName } from "./display";

export function handleSyncEvent({
  data,
  userId,
  setLogs,
  lastAppliedRoomRevRef,
  lastResyncRequestAtRef,
  requestRoomState,
}: {
  data: SyncData;
  userId: string;
  setLogs: React.Dispatch<React.SetStateAction<LogEntry[]>>;
  lastAppliedRoomRevRef: React.MutableRefObject<number>;
  lastResyncRequestAtRef: React.MutableRefObject<number>;
  requestRoomState?: () => void;
}) {
  const receivedAt = Date.now();

  if (typeof data.rev === "number" && Number.isFinite(data.rev)) {
    const last = lastAppliedRoomRevRef.current;

    // Drop stale/out-of-order events.
    if (data.rev <= last) {
      return;
    }

    // If there's a gap, we missed at least one event; request a fresh snapshot.
    if (data.rev > last + 1) {
      if (
        requestRoomState &&
        receivedAt - lastResyncRequestAtRef.current > 1000
      ) {
        lastResyncRequestAtRef.current = receivedAt;
        requestRoomState();
      }
      return;
    }

    lastAppliedRoomRevRef.current = data.rev;
  }

  console.log(
    "[SYNC] Received sync event:",
    data.action,
    "from:",
    data.senderUsername || data.senderId,
  );

  const time = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const userDisplay = getUserDisplayName({
    currentUserId: userId,
    senderId: data.senderId,
    senderUsername: data.senderUsername,
  });

  let logMsg = "";
  if (data.action === "play") logMsg = `started playing`;
  if (data.action === "pause") logMsg = `paused the video`;
  if (data.action === "seek")
    logMsg = `jumped to ${formatTime(data.timestamp)}`;
  if (data.action === "change_url") {
    logMsg = data.videoUrl
      ? `changed video source to ${data.videoUrl}`
      : `changed video source`;
  }

  if (data.action === "set_audio_sync") {
    logMsg =
      typeof data.audioSyncEnabled === "boolean"
        ? `audio sync: ${data.audioSyncEnabled ? "on" : "off"}`
        : "changed audio sync";
  }

  if (data.action === "set_mute") {
    logMsg =
      typeof data.isMuted === "boolean"
        ? `muted: ${data.isMuted}`
        : "toggled mute";
  }
  if (data.action === "set_volume") {
    logMsg =
      typeof data.volume === "number"
        ? `changed volume to ${Math.round(data.volume * 100)}%`
        : "changed volume";
  }
  if (data.action === "set_speed") {
    logMsg =
      typeof data.playbackSpeed === "number"
        ? `changed speed to ${data.playbackSpeed}x`
        : "changed playback speed";
  }

  setLogs((prev) => [
    ...prev,
    { msg: logMsg, type: data.action, time, user: userDisplay },
  ]);
}
