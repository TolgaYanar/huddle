import { useMemo, useState, useEffect } from "react";
import type { WebRTCMediaState } from "shared-logic";
import type { DraggedTilePayload } from "../lib/dnd";
import type { RemoteStreamEntry, StageView } from "../types";

interface UseStagePinningProps {
  userId: string;
  ensureLocalStream: () => MediaStream | null;
  localVideoActive: boolean;
  remoteStreams: RemoteStreamEntry[];
  remoteMedia: Record<string, WebRTCMediaState>;
}

function streamHasLiveVideo(stream: MediaStream) {
  return stream
    .getVideoTracks()
    .some((track) => track.readyState === "live" && !track.muted);
}

export function useStagePinning({
  userId,
  ensureLocalStream,
  localVideoActive,
  remoteStreams,
  remoteMedia,
}: UseStagePinningProps) {
  const [pinnedStage, setPinnedStage] = useState<DraggedTilePayload | null>(
    null,
  );
  const [isStageDragOver, setIsStageDragOver] = useState(false);
  const [isDraggingTile, setIsDraggingTile] = useState(false);

  // A receiver track commonly stays in its MediaStream after its sender is
  // removed and keeps the final frame frozen. The ordered media-state signal
  // is therefore authoritative: a pin must disappear when its actual camera
  // or screen share stops, not merely when the peer leaves.
  useEffect(() => {
    if (!pinnedStage) return;
    if (pinnedStage.kind === "local") {
      if (!localVideoActive) setPinnedStage(null);
      return;
    }
    const found = remoteStreams.find((s) => s.id === pinnedStage.peerId);
    const media = remoteMedia[pinnedStage.peerId];
    const hasVideo = media
      ? Boolean(media.cam || media.screen)
      : Boolean(found && streamHasLiveVideo(found.stream));
    if (!found || !hasVideo) setPinnedStage(null);
  }, [localVideoActive, pinnedStage, remoteMedia, remoteStreams]);

  const stageView = useMemo<StageView | null>(() => {
    if (pinnedStage) {
      if (pinnedStage.kind === "local") {
        if (!localVideoActive) return null;
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
      const media = remoteMedia[pinnedStage.peerId];
      const hasVideo = media
        ? Boolean(media.cam || media.screen)
        : Boolean(found && streamHasLiveVideo(found.stream));
      if (found && hasVideo) {
        return {
          id: pinnedStage.peerId,
          stream: found.stream,
          isLocal: false,
          pinned: true,
        };
      }
    }
    return null;
  }, [
    ensureLocalStream,
    localVideoActive,
    pinnedStage,
    remoteMedia,
    remoteStreams,
    userId,
  ]);

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
