export const TILE_DND_MIME = "application/x-huddle-tile";

export type DraggedTilePayload =
  | { kind: "local" }
  | { kind: "remote"; peerId: string };

export function parseDraggedTilePayload(
  raw: string
): DraggedTilePayload | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as unknown;
    if (typeof obj === "object" && obj !== null) {
      const anyObj = obj as { kind?: unknown; peerId?: unknown };
      if (anyObj.kind === "local") return { kind: "local" };
      if (anyObj.kind === "remote" && typeof anyObj.peerId === "string") {
        return { kind: "remote", peerId: anyObj.peerId };
      }
    }
  } catch {
    // ignore
  }

  if (raw === "local") return { kind: "local" };
  if (raw.startsWith("remote:")) {
    const peerId = raw.slice("remote:".length);
    if (peerId) return { kind: "remote", peerId };
  }
  return null;
}
