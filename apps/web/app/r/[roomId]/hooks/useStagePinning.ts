import { useMemo, useState, useEffect } from "react";
import type { DraggedTilePayload } from "../lib/dnd";
import type { RemoteStreamEntry, StageView } from "../types";

interface UseStagePinningProps {
  userId: string;
  ensureLocalStream: () => MediaStream | null;
  remoteStreams: RemoteStreamEntry[];
}

export function useStagePinning({
  userId,
  ensureLocalStream,
  remoteStreams,
}: UseStagePinningProps) {
  const [pinnedStage, setPinnedStage] = useState<DraggedTilePayload | null>(
    null
  );
  const [isStageDragOver, setIsStageDragOver] = useState(false);
  const [isDraggingTile, setIsDraggingTile] = useState(false);

  // If the pinned remote user leaves, unpin
  useEffect(() => {
    if (!pinnedStage) return;
    if (pinnedStage.kind !== "remote") return;
    const stillThere = remoteStreams.some((s) => s.id === pinnedStage.peerId);
    if (!stillThere) setPinnedStage(null);
  }, [pinnedStage, remoteStreams]);

  const stageView = useMemo<StageView | null>(() => {
    if (pinnedStage) {
      if (pinnedStage.kind === "local") {
        const s = ensureLocalStream();
        if (!s) return null;

        return {
          id: userId || "you",
          stream: s,
          isLocal: true,
          pinned: true,
        };
      }

      const found = remoteStreams.find((s) => s.id === pinnedStage.peerId);
      if (found) {
        return {
          id: pinnedStage.peerId,
          stream: found.stream,
          isLocal: false,
          pinned: true,
        };
      }
    }
    return null;
  }, [pinnedStage, remoteStreams, userId, ensureLocalStream]);

  const stageViewForPlayer = useMemo(() => {
    if (!stageView) return null;
    return {
      id: stageView.id,
      isLocal: stageView.isLocal,
      stream: stageView.stream,
    };
  }, [stageView]);

  return {
    pinnedStage,
    setPinnedStage,
    isStageDragOver,
    setIsStageDragOver,
    isDraggingTile,
    setIsDraggingTile,
    stageView,
    stageViewForPlayer,
    onUnpinStage: () => setPinnedStage(null),
  };
}
