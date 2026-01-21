export function getUserDisplayName({
  currentUserId,
  senderId,
  senderUsername,
  systemLabel = "System",
}: {
  currentUserId: string;
  senderId?: string | null;
  senderUsername?: string | null;
  systemLabel?: string;
}) {
  const isSystem = senderId === "system";
  const isMe = senderId === currentUserId;
  if (isSystem) return systemLabel;
  if (isMe) return "You";
  return senderUsername || senderId || "Unknown";
}
