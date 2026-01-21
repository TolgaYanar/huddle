import { useCallback } from "react";

import {
  normalizeVideoUrl,
  isYouTubeUrl,
  getYouTubeStartTime,
} from "../../lib/video";
import { fetchVideoPreview } from "../../lib/video-preview";
import { USER_PAUSE_INTENT_WINDOW_MS } from "./constants";
import type { AddLogEntry, SendSyncEvent } from "./types";
import type { VideoPlayerState } from "./state";

export function useUrlHandlers({
  state,
  sendSyncEvent,
  addLogEntry,
}: {
  state: VideoPlayerState;
  sendSyncEvent: SendSyncEvent;
  addLogEntry?: AddLogEntry;
}) {
  const {
    url,
    inputUrl,
    setUrl,
    setInputUrl,
    setVideoState,
    setCurrentTime,
    setPlayerReady,
    setPlayerError,
    latestVideoStateRef,
    previewRequestIdRef,
    setIsPreviewLoading,
    setVideoPreview,
    setShowPreviewModal,
    lastUserPauseAtRef,
  } = state;

  const handleUrlChange = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (inputUrl === url) return;

      const normalized = normalizeVideoUrl(inputUrl);
      if (!normalized) return;

      const requestId = ++previewRequestIdRef.current;
      setIsPreviewLoading(true);
      setVideoPreview({
        url: normalized,
        title: "Loading preview…",
        thumbnail: null,
        duration: null,
        platform: "unknown",
      });
      setShowPreviewModal(true);

      const preview = await fetchVideoPreview(normalized).catch(() => null);
      if (previewRequestIdRef.current !== requestId) return;

      setIsPreviewLoading(false);
      setVideoPreview(
        preview ?? {
          url: normalized,
          title: "Video",
          thumbnail: null,
          duration: null,
          platform: "unknown",
        },
      );
    },
    [
      inputUrl,
      previewRequestIdRef,
      setIsPreviewLoading,
      setShowPreviewModal,
      setVideoPreview,
      url,
    ],
  );

  const loadVideoUrl = useCallback(
    (
      nextUrl: string,
      options?: { forcePlay?: boolean; skipBroadcast?: boolean },
    ) => {
      const { forcePlay, skipBroadcast } = options ?? {};
      const wasPlaying = latestVideoStateRef.current === "Playing";

      const initialTime = (() => {
        try {
          if (!isYouTubeUrl(nextUrl)) return 0;
          const st = getYouTubeStartTime(nextUrl);
          return st && st > 0 ? st : 0;
        } catch {
          return 0;
        }
      })();

      setPlayerReady(false);
      setPlayerError(null);
      setUrl(nextUrl);
      setInputUrl(nextUrl);
      setCurrentTime(initialTime);

      if (!skipBroadcast) {
        sendSyncEvent("change_url", initialTime, nextUrl);
      }

      // Check if user recently paused - don't auto-resume if so
      const userPausedRecently =
        lastUserPauseAtRef &&
        Date.now() - lastUserPauseAtRef.current < USER_PAUSE_INTENT_WINDOW_MS;

      if (wasPlaying || (forcePlay && !userPausedRecently)) {
        setVideoState("Playing");
        if (!skipBroadcast) {
          sendSyncEvent("play", initialTime, nextUrl);
        }
      } else {
        setVideoState("Paused");
      }
      addLogEntry?.({
        msg: `changed video source`,
        type: "change_url",
        user: "You",
      });
      setIsPreviewLoading(false);
      setShowPreviewModal(false);
    },
    [
      addLogEntry,
      latestVideoStateRef,
      sendSyncEvent,
      setCurrentTime,
      setInputUrl,
      setIsPreviewLoading,
      setPlayerError,
      setPlayerReady,
      setShowPreviewModal,
      setUrl,
      setVideoState,
      lastUserPauseAtRef,
    ],
  );

  const closePreviewModal = useCallback(() => {
    previewRequestIdRef.current++;
    setIsPreviewLoading(false);
    setShowPreviewModal(false);
  }, [previewRequestIdRef, setIsPreviewLoading, setShowPreviewModal]);

  return {
    handleUrlChange,
    loadVideoUrl,
    closePreviewModal,
  };
}
