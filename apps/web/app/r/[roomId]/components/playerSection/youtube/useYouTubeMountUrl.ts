import * as React from "react";

export function useYouTubeMountUrl({
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
}: {
  isClient: boolean;
  isYouTube: boolean;
  normalizedUrl: string;
  isPageVisible: boolean;
  useYouTubeIFrameApi: boolean;
  ytUseStableIframe: boolean;
  youtubeMountUrl: string | null;
  setYoutubeMountUrl: React.Dispatch<React.SetStateAction<string | null>>;
  ytRequestedIdRef: React.MutableRefObject<string | null>;
  ytConfirmedIdRef: React.MutableRefObject<string | null>;
  setYtConfirmedId: React.Dispatch<React.SetStateAction<string | null>>;
  setYtUseStableIframe: React.Dispatch<React.SetStateAction<boolean>>;
  ytLastForcedRemountIdRef: React.MutableRefObject<string | null>;
  ytLastNormalizedUrlRef: React.MutableRefObject<string | null>;
  ytUrlChangedWhileVisibleRef: React.MutableRefObject<boolean>;
}) {
  // Track whether the most recent YouTube URL change happened while the page
  // was visible. If the URL changed while hidden (background playlist advance),
  // we avoid remounting the iframe on return, which would restart playback.
  React.useEffect(() => {
    if (!isClient) return;
    if (useYouTubeIFrameApi) return;
    if (!isYouTube) {
      ytLastNormalizedUrlRef.current = null;
      ytUrlChangedWhileVisibleRef.current = true;
      return;
    }

    const prev = ytLastNormalizedUrlRef.current;
    if (prev !== normalizedUrl) {
      ytLastNormalizedUrlRef.current = normalizedUrl;
      ytUrlChangedWhileVisibleRef.current = isPageVisible;
    }
  }, [
    isClient,
    isYouTube,
    normalizedUrl,
    isPageVisible,
    useYouTubeIFrameApi,
    ytLastNormalizedUrlRef,
    ytUrlChangedWhileVisibleRef,
  ]);

  React.useEffect(() => {
    if (!isClient) return;
    if (useYouTubeIFrameApi) return;
    if (!isYouTube) {
      if (youtubeMountUrl !== null) {
        setYoutubeMountUrl(null);
        ytRequestedIdRef.current = null;
        ytConfirmedIdRef.current = null;
        setYtConfirmedId(null);
        setYtUseStableIframe(true);
        ytLastForcedRemountIdRef.current = null;
        ytLastNormalizedUrlRef.current = null;
        ytUrlChangedWhileVisibleRef.current = true;
      }
      return;
    }

    // When stable-iframe mode is disabled (fallback), always mount the current URL.
    if (!ytUseStableIframe) {
      if (normalizedUrl && youtubeMountUrl !== normalizedUrl) {
        setYoutubeMountUrl(normalizedUrl);
        ytRequestedIdRef.current = null;
        ytConfirmedIdRef.current = null;
        setYtConfirmedId(null);
        ytLastForcedRemountIdRef.current = null;
      }
      return;
    }

    // When visible, prefer remounting the iframe for reliability (manual/foreground switches).
    // When hidden, keep a stable iframe and switch via IFrame API (background-friendly).
    if (youtubeMountUrl === null && normalizedUrl) {
      setYoutubeMountUrl(normalizedUrl);
      return;
    }

    if (
      isPageVisible &&
      ytUrlChangedWhileVisibleRef.current &&
      normalizedUrl &&
      youtubeMountUrl !== normalizedUrl
    ) {
      setYoutubeMountUrl(normalizedUrl);
      ytRequestedIdRef.current = null;
      ytConfirmedIdRef.current = null;
      setYtConfirmedId(null);
      ytLastForcedRemountIdRef.current = null;
    }
  }, [
    isClient,
    isYouTube,
    normalizedUrl,
    youtubeMountUrl,
    isPageVisible,
    useYouTubeIFrameApi,
    ytUseStableIframe,
    setYoutubeMountUrl,
    ytRequestedIdRef,
    ytConfirmedIdRef,
    setYtConfirmedId,
    setYtUseStableIframe,
    ytLastForcedRemountIdRef,
    ytLastNormalizedUrlRef,
    ytUrlChangedWhileVisibleRef,
  ]);
}
