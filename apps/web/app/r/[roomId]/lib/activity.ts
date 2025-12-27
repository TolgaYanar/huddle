import type { ActivityEvent } from "shared-logic";

export function safeToTimeString(value: string | Date) {
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) {
      return new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    }
    return d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }
}

export function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function capitalize(s: string) {
  if (s === "change_url") return "Change";
  if (s === "chat") return "Chat";
  if (s === "join") return "Join";
  if (s === "leave") return "Leave";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function mapActivityEventToLog(
  e: ActivityEvent
): { type: string; msg: string } | null {
  if (!e) return null;

  if (e.kind === "join") {
    return { type: "join", msg: "joined the room" };
  }

  if (e.kind === "leave") {
    return { type: "leave", msg: "left the room" };
  }

  if (e.kind === "sync") {
    const action = e.action ?? undefined;
    if (action === "play") return { type: "play", msg: "started playing" };
    if (action === "pause") return { type: "pause", msg: "paused the video" };
    if (action === "seek") {
      const ts = typeof e.timestamp === "number" ? e.timestamp : 0;
      return { type: "seek", msg: `jumped to ${formatTime(ts)}` };
    }
    if (action === "change_url") {
      const url = typeof e.videoUrl === "string" ? e.videoUrl : "";
      return {
        type: "change_url",
        msg: url ? `changed video source to ${url}` : "changed video source",
      };
    }
  }

  return null;
}
