import * as React from "react";

import {
  getYouTubeStartTime,
  getYouTubeVideoId,
  isYouTubeUrl,
} from "../../lib/video";

import { useYouTubeAudioRestore } from "./youtube/useYouTubeAudioRestore";
import { useYouTubeBackgroundEvents } from "./youtube/useYouTubeBackgroundEvents";
import { useYouTubeFlags } from "./youtube/useYouTubeFlags";
import { useYouTubeMountUrl } from "./youtube/useYouTubeMountUrl";
import { usePageVisibility } from "./youtube/usePageVisibility";
import { useYouTubeStuckRecovery } from "./youtube/useYouTubeStuckRecovery";
import { useYouTubeSwitchByIFrameApi } from "./youtube/useYouTubeSwitchByIFrameApi";
import { useYouTubeVolumeSync } from "./youtube/useYouTubeVolumeSync";

export function useYouTubePlayback({
  isClient,
  normalizedUrl,
  canPlay,
  playerRef,
  effectiveMuted,
  effectiveVolume,
  videoState,
  suppressNextPlayBroadcast,
  setPlayerReady,
  setPlayerError,
  setIsBuffering,
  clearLoadTimeout,
  applyingRemoteSyncRef,
  onVideoEnded,
}: {
  isClient: boolean;
  normalizedUrl: string;
  canPlay: boolean;
  playerRef: React.RefObject<unknown>;
  effectiveMuted: boolean;
  effectiveVolume: number;
  videoState: string;
  suppressNextPlayBroadcast: (ms?: number) => void;
  setPlayerReady: React.Dispatch<React.SetStateAction<boolean>>;
  setPlayerError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsBuffering: React.Dispatch<React.SetStateAction<boolean>>;
  clearLoadTimeout: () => void;
  applyingRemoteSyncRef: React.MutableRefObject<boolean>;
  onVideoEnded?: () => void;
}) {
  // For YouTube, avoid swapping the iframe `src` for every playlist item.
  // Swapping `src` is what triggers autoplay gating in background and makes
  // the next track sit at 0:00 until the tab regains focus.
  const isYouTube = React.useMemo(
    () => isYouTubeUrl(normalizedUrl),
    [normalizedUrl],
  );

  const isPageVisible = usePageVisibility(isClient);

  const { useYouTubeIFrameApi, debugYouTube, initialStableIframe } =
    useYouTubeFlags();

  const [youtubeMountUrl, setYoutubeMountUrl] = React.useState<string | null>(
    null,
  );
  const ytRequestedIdRef = React.useRef<string | null>(null);
  const ytConfirmedIdRef = React.useRef<string | null>(null);
  const [ytConfirmedId, setYtConfirmedId] = React.useState<string | null>(null);
  const [ytForceRemountNonce, setYtForceRemountNonce] = React.useState(0);
  const [ytUseStableIframe, setYtUseStableIframe] = React.useState(
    () => initialStableIframe,
  );

  const ytLastForcedRemountIdRef = React.useRef<string | null>(null);
  const ytVisibleStuckRemountIdRef = React.useRef<string | null>(null);
  const ytVisibleStuckAttemptsRef = React.useRef(0);
  const ytLastUserRecoverAtRef = React.useRef(0);
  const ytLastNormalizedUrlRef = React.useRef<string | null>(null);
  const ytUrlChangedWhileVisibleRef = React.useRef<boolean>(true);
  const [ytAudioBlockedInBackground, setYtAudioBlockedInBackground] =
    React.useState(false);

  useYouTubeVolumeSync({
    isClient,
    isYouTube,
    playerRef,
    effectiveMuted,
    effectiveVolume,
  });

  useYouTubeAudioRestore({
    isClient,
    isYouTube,
    isPageVisible,
    ytAudioBlockedInBackground,
    setYtAudioBlockedInBackground,
    playerRef,
    effectiveMuted,
    effectiveVolume,
    videoState,
    suppressNextPlayBroadcast,
  });

  useYouTubeMountUrl({
    isClient,
    isYouTube,
    normalizedUrl,
    isPageVisible,
    useYouTubeIFrameApi,
    ytUseStableIframe,
    youtubeMountUrl,
    setYoutubeMountUrl,
    ytRequestedIdRef,
    ytConfirmedIdRef,
    setYtConfirmedId,
    setYtUseStableIframe,
    ytLastForcedRemountIdRef,
    ytLastNormalizedUrlRef,
    ytUrlChangedWhileVisibleRef,
  });

  const playerSrc =
    isYouTube && !useYouTubeIFrameApi
      ? (youtubeMountUrl ?? normalizedUrl)
      : normalizedUrl;
  const reactPlayerSrc = isYouTube
    ? playerSrc
    : canPlay
      ? playerSrc
      : undefined;

  const youTubeDesiredId = React.useMemo(
    () => (isYouTube ? getYouTubeVideoId(normalizedUrl) : null),
    [isYouTube, normalizedUrl],
  );

  // Extract start time from YouTube URL (e.g., ?t=2391)
  const youTubeStartTime = React.useMemo(
    () => (isYouTube ? getYouTubeStartTime(normalizedUrl) : null),
    [isYouTube, normalizedUrl],
  );

  const youTubeIsOnDesired =
    !isYouTube ||
    !youTubeDesiredId ||
    useYouTubeIFrameApi ||
    !ytUseStableIframe ||
    ytConfirmedId === youTubeDesiredId;

  useYouTubeStuckRecovery({
    isClient,
    isYouTube,
    isPageVisible,
    videoState,
    youTubeIsOnDesired,
    youTubeDesiredId,
    ytConfirmedId,
    normalizedUrl,
    useYouTubeIFrameApi,
    ytUseStableIframe,
    canPlay,
    playerSrc,
    playerRef,
    setPlayerReady,
    setIsBuffering,
    setYoutubeMountUrl,
    setYtForceRemountNonce,
    ytRequestedIdRef,
    ytConfirmedIdRef,
    setYtConfirmedId,
    ytLastForcedRemountIdRef,
    ytVisibleStuckRemountIdRef,
    ytVisibleStuckAttemptsRef,
    setYtUseStableIframe,
  });

  useYouTubeSwitchByIFrameApi({
    isClient,
    isYouTube,
    normalizedUrl,
    playerRef,
    videoState,
    debugYouTube,
    useYouTubeIFrameApi,
    ytConfirmedId,
    ytConfirmedIdRef,
    ytRequestedIdRef,
    setYtConfirmedId,
    setPlayerReady,
    setPlayerError,
    setIsBuffering,
    clearLoadTimeout,
    suppressNextPlayBroadcast,
    ytLastForcedRemountIdRef,
    setYoutubeMountUrl,
  });

  useYouTubeBackgroundEvents({
    isClient,
    isYouTube,
    isPageVisible,
    normalizedUrl,
    onVideoEnded,
    playerRef,
    videoState,
    applyingRemoteSyncRef,
    debugYouTube,
    effectiveMuted,
    effectiveVolume,
    useYouTubeIFrameApi,
    suppressNextPlayBroadcast,
    ytRequestedIdRef,
    ytConfirmedIdRef,
    setYtAudioBlockedInBackground,
  });

  return {
    isYouTube,
    isPageVisible,
    ytAudioBlockedInBackground,

    useYouTubeIFrameApi,
    debugYouTube,

    playerSrc,
    reactPlayerSrc,

    youTubeDesiredId,
    youTubeStartTime,
    youTubeIsOnDesired,

    youtubeMountUrl,
    setYoutubeMountUrl,

    ytRequestedIdRef,
    ytConfirmedIdRef,
    ytConfirmedId,
    setYtConfirmedId,

    ytForceRemountNonce,
    setYtForceRemountNonce,

    ytUseStableIframe,
    setYtUseStableIframe,

    ytLastUserRecoverAtRef,
  };
}
