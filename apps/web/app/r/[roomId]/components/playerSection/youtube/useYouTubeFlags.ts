import * as React from "react";

export function useYouTubeFlags() {
  const useYouTubeIFrameApi = React.useMemo(() => {
    // Default ON: persistent official IFrame API player.
    // Opt-out via localStorage for debugging: huddle:ytIFrameApi = "0".
    if (typeof window === "undefined") return true;
    try {
      return window.localStorage.getItem("huddle:ytIFrameApi") !== "0";
    } catch {
      return true;
    }
  }, []);

  const debugYouTube = React.useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("huddle:debugYouTube") === "1";
    } catch {
      return false;
    }
  }, []);

  const initialStableIframe = React.useMemo(() => {
    // Default OFF: stable-iframe mode depends on the YouTube internal player API
    // being available, which can be blocked by privacy settings/extensions and
    // causes timeouts. Users can opt in for background-play experiments.
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("huddle:ytStableIframe") === "1";
    } catch {
      return false;
    }
  }, []);

  return { useYouTubeIFrameApi, debugYouTube, initialStableIframe };
}
