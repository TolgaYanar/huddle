/**
 * Which service a room's video URL belongs to.
 *
 * Derived on the server from the URL rather than taken from the client: the
 * value ends up in stored room state, and a client should not be able to
 * mislabel it. Detection is a pure function of the URL, so it also applies
 * to rooms created before this existed.
 *
 * The token set matches src/telemetry/syncMetric.js so a room's platform and
 * its sync measurements can be compared without a translation table.
 */

// Ordered: the first match wins, so put hosts that can appear inside another
// platform's URL (a YouTube link embedded in a query string) after their
// more specific matches.
const MATCHERS = [
  ["netflix", /(^|\.)netflix\.com$/],
  ["prime", /(^|\.)primevideo\.com$/],
  ["disney_plus", /(^|\.)disneyplus\.com$/],
  ["youtube", /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/],
  ["twitch", /(^|\.)twitch\.tv$/],
  ["kick", /(^|\.)kick\.com$/],
  ["vimeo", /(^|\.)vimeo\.com$/],
  ["dailymotion", /(^|\.)(dailymotion\.com|dai\.ly)$/],
  ["soundcloud", /(^|\.)soundcloud\.com$/],
  ["loom", /(^|\.)loom\.com$/],
];

const DIRECT_MEDIA = /\.(mp4|webm|ogg|ogv|m3u8|mpd|mov|mkv|mp3|m4a|wav|flac)$/i;

/**
 * Returns a platform token, or null when the URL is absent or unusable.
 * "other" means a real URL on a service we do not recognise — distinct from
 * null, which means there is nothing playing.
 */
function detectPlatform(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return null;

  let url;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  for (const [platform, pattern] of MATCHERS) {
    if (pattern.test(host)) return platform;
  }

  // A bare media file the player streams directly, rather than a service.
  if (DIRECT_MEDIA.test(url.pathname)) return "file";

  return "other";
}

module.exports = { detectPlatform };
