import type { ActivityEvent, ActivityHistoryData } from "shared-logic";

import type { LogEntry } from "../../types";
import { mapActivityEventToLog, safeToTimeString } from "../../lib/activity";
import { getUserDisplayName } from "./display";

export function applyActivityHistory({
  prev,
  data,
  roomId,
  userId,
}: {
  prev: LogEntry[];
  data: ActivityHistoryData;
  roomId: string;
  userId: string;
}) {
  if (!data || data.roomId !== roomId || !Array.isArray(data.events)) {
    return prev;
  }

  const existingIds = new Set(prev.map((l) => l.id).filter(Boolean));
  const next = [...prev];

  for (const e of data.events) {
    if (!e?.id || existingIds.has(e.id)) continue;

    const userDisplay = getUserDisplayName({
      currentUserId: userId,
      senderId: e.senderId,
      senderUsername: e.senderUsername,
    });
    const t = safeToTimeString(e.createdAt);
    const mapped = mapActivityEventToLog(e);
    if (!mapped) continue;

    next.push({
      id: e.id,
      msg: mapped.msg,
      type: mapped.type,
      time: t,
      user: userDisplay,
    });
  }

  return next;
}

export function applyActivityEvent({
  prev,
  event,
  roomId,
  userId,
}: {
  prev: LogEntry[];
  event: ActivityEvent;
  roomId: string;
  userId: string;
}) {
  if (!event || event.roomId !== roomId) return prev;

  const mapped = mapActivityEventToLog(event);
  if (!mapped) return prev;

  const userDisplay = getUserDisplayName({
    currentUserId: userId,
    senderId: event.senderId,
    senderUsername: event.senderUsername,
  });
  const t = safeToTimeString(event.createdAt);

  if (prev.some((l) => l.id === event.id)) return prev;

  return [
    ...prev,
    {
      id: event.id,
      msg: mapped.msg,
      type: mapped.type,
      time: t,
      user: userDisplay,
    },
  ];
}
