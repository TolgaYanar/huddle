import { useMemo } from "react";

import {
  detectPlatform,
  isTier3Platform,
  type PlatformType,
} from "../components/videoControls/platform";
import {
  getKickEmbedSrc,
  getTwitchEmbedSrc,
  isNetflixUrl,
  isPrimeVideoUrl,
  isProblematicYoutubeUrl,
  shouldEmbedWebpage,
} from "../lib/video";
import {
  getDailymotionEmbedSrc,
  getLoomEmbedSrc,
  getPeerTubeEmbedSrc,
  getSoundCloudEmbedSrc,
  getVimeoEmbedSrc,
} from "../lib/embeds";

export type VideoEmbedInfo = {
  platform: PlatformType;
  embedParent: string;
  twitchEmbedSrc: string | null;
  isTwitch: boolean;
  kickEmbedSrc: string | null;
  isKick: boolean;
  vimeoEmbedSrc: string | null;
  isVimeo: boolean;
  dailymotionEmbedSrc: string | null;
  isDailymotion: boolean;
  soundCloudEmbedSrc: string | null;
  isSoundCloud: boolean;
  loomEmbedSrc: string | null;
  isLoom: boolean;
  peerTubeEmbedSrc: string | null;
  isPeerTube: boolean;
  isPrime: boolean;
  isNetflix: boolean;
  // Aggregate flag for any DRM-protected source we can't embed inline. The
  // player swaps to an "install the extension" CTA for these.
  isTier3: boolean;
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
    const platform = detectPlatform(normalizedUrl);

    const twitchEmbedSrc = getTwitchEmbedSrc(normalizedUrl, embedParent);
    const isTwitch = twitchEmbedSrc !== null;

    const kickEmbedSrc = getKickEmbedSrc(normalizedUrl);
    const isKick = kickEmbedSrc !== null;

    const vimeoEmbedSrc = getVimeoEmbedSrc(normalizedUrl);
    const isVimeo = vimeoEmbedSrc !== null;

    const dailymotionEmbedSrc = getDailymotionEmbedSrc(normalizedUrl);
    const isDailymotion = dailymotionEmbedSrc !== null;

    const soundCloudEmbedSrc = getSoundCloudEmbedSrc(normalizedUrl);
    const isSoundCloud = soundCloudEmbedSrc !== null;

    const loomEmbedSrc = getLoomEmbedSrc(normalizedUrl);
    const isLoom = loomEmbedSrc !== null;

    const peerTubeEmbedSrc = getPeerTubeEmbedSrc(normalizedUrl);
    const isPeerTube = peerTubeEmbedSrc !== null;

    const isPrime = isPrimeVideoUrl(normalizedUrl);
    const isNetflix = isNetflixUrl(normalizedUrl);
    const isTier3 = isTier3Platform(platform);
    const isBadYoutubeUrl = isProblematicYoutubeUrl(url);
    const isWebEmbed = shouldEmbedWebpage(normalizedUrl);

    // canPlay: we have *some* renderer that will at least try the URL. Tier-3
    // platforms (other than Netflix's manual-sync mode) deliberately fall
    // through to the CTA card; we mark them as "not playable" so the rest of
    // the player chrome stays disabled.
    const drmTier3 = isTier3 && !isNetflix;

    const canPlay =
      !drmTier3 &&
      (((!isBadYoutubeUrl && normalizedUrl.length > 0) ||
        isKick ||
        isTwitch ||
        isNetflix ||
        isVimeo ||
        isDailymotion ||
        isSoundCloud ||
        isLoom ||
        isPeerTube) &&
        !isPrime);

    const canControlPlayback =
      !isKick &&
      !isTwitch &&
      !isPrime &&
      !isLoom &&
      !drmTier3;

    return {
      platform,
      embedParent,
      twitchEmbedSrc,
      isTwitch,
      kickEmbedSrc,
      isKick,
      vimeoEmbedSrc,
      isVimeo,
      dailymotionEmbedSrc,
      isDailymotion,
      soundCloudEmbedSrc,
      isSoundCloud,
      loomEmbedSrc,
      isLoom,
      peerTubeEmbedSrc,
      isPeerTube,
      isPrime,
      isNetflix,
      isTier3,
      isBadYoutubeUrl,
      isWebEmbed,
      canPlay,
      canControlPlayback,
    };
  }, [embedParent, normalizedUrl, url]);
}
