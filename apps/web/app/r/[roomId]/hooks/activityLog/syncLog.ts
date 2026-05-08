import type { SyncData } from "shared-logic";

import type { LogEntry } from "../../types";
import { formatTime } from "../../lib/activity";
import { getUserDisplayName } from "./display";

export function handleSyncEvent({
  data,
  userId,
  setLogs,
  lastAppliedRoomRevRef,
  lastLoggedRevRef,
  lastResyncRequestAtRef,
  requestRoomState,
}: {
  data: SyncData;
  userId: string;
  setLogs: React.Dispatch<React.SetStateAction<LogEntry[]>>;
  // The rev that the player state was last brought up to (driven by both
  // receive_sync AND room_state via Math.max).
  lastAppliedRoomRevRef: React.MutableRefObject<number>;
  // The rev that the activity log was last brought up to. Tracked separately
  // so that an out-of-order room_state advancing applyRoomState doesn't trip
  // the dedupe and drop the corresponding chat log line.
  lastLoggedRevRef: React.MutableRefObject<number>;
  lastResyncRequestAtRef: React.MutableRefObject<number>;
  requestRoomState?: () => void;
}) {
  const receivedAt = Date.now();

  if (typeof data.rev === "number" && Number.isFinite(data.rev)) {
    const lastLogged = lastLoggedRevRef.current;

    // Drop stale/out-of-order events for the log.
    if (data.rev <= lastLogged) {
      return;
    }

    // If there's a gap, we missed at least one event; request a fresh snapshot.
    // Use the *applied* rev for gap detection — that's the rev the server
    // believes we're up to, and the one a re-sync would refresh.
    if (data.rev > lastAppliedRoomRevRef.current + 1) {
      if (
        requestRoomState &&
        receivedAt - lastResyncRequestAtRef.current > 1000
      ) {
        lastResyncRequestAtRef.current = receivedAt;
        requestRoomState();
      }
      // Still record this rev as logged so we don't keep re-requesting on
      // every subsequent receive_sync.
      lastLoggedRevRef.current = data.rev;
      return;
    }

    lastLoggedRevRef.current = data.rev;
    if (data.rev > lastAppliedRoomRevRef.current) {
      lastAppliedRoomRevRef.current = data.rev;
    }
  }

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
