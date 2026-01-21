import { useMemo } from "react";

import {
  getKickEmbedSrc,
  getTwitchEmbedSrc,
  isNetflixUrl,
  isPrimeVideoUrl,
  isProblematicYoutubeUrl,
  shouldEmbedWebpage,
} from "../lib/video";

export type VideoEmbedInfo = {
  embedParent: string;
  twitchEmbedSrc: string | null;
  isTwitch: boolean;
  kickEmbedSrc: string | null;
  isKick: boolean;
  isPrime: boolean;
  isNetflix: boolean;
  isBadYoutubeUrl: boolean;
  isWebEmbed: boolean;
  canPlay: boolean;
  canControlPlayback: boolean;
};

export function useVideoEmbedInfo(options: {
  isClient: boolean;
  normalizedUrl: string;
  url: string;
}): VideoEmbedInfo {
  const { isClient, normalizedUrl, url } = options;

  const embedParent = useMemo(() => {
    if (!isClient) return "localhost";
    if (typeof window === "undefined") return "localhost";
    return window.location.hostname;
  }, [isClient]);

  return useMemo(() => {
    const twitchEmbedSrc = getTwitchEmbedSrc(normalizedUrl, embedParent);
    const isTwitch = twitchEmbedSrc !== null;

    const kickEmbedSrc = getKickEmbedSrc(normalizedUrl);
    const isKick = kickEmbedSrc !== null;

    const isPrime = isPrimeVideoUrl(normalizedUrl);
    const isNetflix = isNetflixUrl(normalizedUrl);
    const isBadYoutubeUrl = isProblematicYoutubeUrl(url);
    const isWebEmbed = shouldEmbedWebpage(normalizedUrl);

    const canPlay =
      (((!isBadYoutubeUrl && normalizedUrl.length > 0) ||
        isKick ||
        isTwitch ||
        isNetflix) &&
        !isPrime) ||
      isWebEmbed;

    const canControlPlayback = !isKick && !isTwitch && !isPrime && !isWebEmbed;

    return {
      embedParent,
      twitchEmbedSrc,
      isTwitch,
      kickEmbedSrc,
      isKick,
      isPrime,
      isNetflix,
      isBadYoutubeUrl,
      isWebEmbed,
      canPlay,
      canControlPlayback,
    };
  }, [embedParent, normalizedUrl, url]);
}
