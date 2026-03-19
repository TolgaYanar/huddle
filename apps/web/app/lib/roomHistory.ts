const STORAGE_KEY = "huddle:roomHistory";
const MAX_ENTRIES = 10;

export type RoomHistoryEntry = {
  roomId: string;
  name: string | null;
  visitedAt: number;
};

export function readRoomHistory(): RoomHistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e) =>
        e &&
        typeof e.roomId === "string" &&
        typeof e.visitedAt === "number",
    ) as RoomHistoryEntry[];
  } catch {
    return [];
  }
}

export function writeRoomHistory(roomId: string, name: string | null): void {
  try {
    const existing = readRoomHistory().filter((e) => e.roomId !== roomId);
    const next: RoomHistoryEntry[] = [
      { roomId, name, visitedAt: Date.now() },
      ...existing,
    ].slice(0, MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    // Keep legacy key in sync for backwards compatibility.
    window.localStorage.setItem("huddle:lastRoomId", roomId);
  } catch {
    // ignore
  }
}
