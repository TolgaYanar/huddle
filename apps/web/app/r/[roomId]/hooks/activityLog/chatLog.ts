import type { ChatHistoryData, ChatMessage } from "shared-logic";

import type { LogEntry } from "../../types";
import { safeToTimeString } from "../../lib/activity";
import { getUserDisplayName } from "./display";

export function applyChatHistory({
  prev,
  data,
  roomId,
  userId,
}: {
  prev: LogEntry[];
  data: ChatHistoryData;
  roomId: string;
  userId: string;
}) {
  if (!data || data.roomId !== roomId || !Array.isArray(data.messages)) {
    return prev;
  }

  const existingChatIds = new Set(
    prev
      .filter((l) => l.type === "chat")
      .map((l) => l.id)
      .filter(Boolean),
  );

  const next = [...prev];
  for (const m of data.messages) {
    if (!m?.id || existingChatIds.has(m.id)) continue;
    const t = safeToTimeString(m.createdAt);
    const userDisplay = getUserDisplayName({
      currentUserId: userId,
      senderId: m.senderId,
      senderUsername: m.senderUsername,
    });
    next.push({
      id: m.id,
      msg: m.text,
      type: "chat",
      time: t,
      user: userDisplay,
    });
  }
  return next;
}

export function applyChatMessage({
  prev,
  message,
  roomId,
  userId,
}: {
  prev: LogEntry[];
  message: ChatMessage;
  roomId: string;
  userId: string;
}) {
  if (!message || message.roomId !== roomId) return prev;

  const t = safeToTimeString(message.createdAt);
  const userDisplay = getUserDisplayName({
    currentUserId: userId,
    senderId: message.senderId,
    senderUsername: message.senderUsername,
  });

  const exists = prev.some((l) => l.id === message.id);
  if (exists) return prev;

  return [
    ...prev,
    {
      id: message.id,
      msg: message.text,
      type: "chat",
      time: t,
      user: userDisplay,
    },
  ];
}
