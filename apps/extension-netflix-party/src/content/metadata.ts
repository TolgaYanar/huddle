/**
 * Best-effort scraping of Netflix's title + poster image from the active
 * /watch page. These reads are intentionally defensive — Netflix can and
 * does change its DOM structure without warning, so every selector here
 * is wrapped in a try/catch and falls back to a sensible string.
 *
 * The popup consumes these to give the user something to recognise:
 * "Yes, the room is currently watching Stranger Things S4:E2 — Vecna's
 * Curse" instead of a bare /watch/81628497 URL.
 */

export type NetflixMetadata = {
  /** Cleaned title — show + episode, ready to display directly. */
  title: string | null;
  /** Optional poster URL (Netflix's "boxart" / billboard image). */
  posterUrl: string | null;
  /** Optional episode line — e.g. "S4:E2 · Vecna's Curse". */
  episode: string | null;
};

const TITLE_NOISE = / [-—] Netflix\s*$/i;

function cleanTitle(raw: string): string {
  // document.title is usually "Show — Netflix" or "Show · S1:E1 — Netflix".
  return raw.replace(TITLE_NOISE, "").trim();
}

function pickPosterFromMeta(): string | null {
  // og:image is a reliable enough public hook on most Netflix pages.
  try {
    const m = document.querySelector<HTMLMetaElement>(
      'meta[property="og:image"]',
    );
    const content = m?.content?.trim();
    if (content && /^https?:\/\//i.test(content)) return content;
  } catch {
    // ignore
  }
  return null;
}

function pickPosterFromNetflixApi(): string | null {
  // Netflix's player API exposes the boxart URL on the active video
  // metadata. We can't reach it directly from the content script (isolated
  // world) — content scripts run in a separate JS context from the page —
  // so we look for a DOM hint instead. The .billboard-row__background-img
  // class and the boxart inside .player-streams metadata are the most
  // stable.
  try {
    const candidates = [
      'img.boxart-image[src]',
      'img.previewModal--boxart[src]',
      'img.title-card--metadataWrapper-image[src]',
      'div.video-artwork img[src]',
    ];
    for (const sel of candidates) {
      const img = document.querySelector<HTMLImageElement>(sel);
      const src = img?.src?.trim();
      if (src && /^https?:\/\//i.test(src)) return src;
    }
  } catch {
    // ignore
  }
  return null;
}

function pickEpisodeFromDom(): string | null {
  // Netflix renders "S1:E2 Episode Title" near the player on the watch
  // page itself; the exact class varies. We pick the most likely
  // candidates and take the first non-empty short string.
  try {
    const candidates = [
      "[data-uia='video-title']",
      ".watch-video--label",
      ".video-title h4",
    ];
    for (const sel of candidates) {
      const el = document.querySelector<HTMLElement>(sel);
      const text = el?.textContent?.trim();
      if (text && text.length < 200) return text;
    }
  } catch {
    // ignore
  }
  return null;
}

export function extractNetflixMetadata(): NetflixMetadata {
  let title: string | null = null;
  try {
    const t = document.title;
    if (t) title = cleanTitle(t);
  } catch {
    title = null;
  }

  const posterUrl = pickPosterFromMeta() ?? pickPosterFromNetflixApi();
  const episode = pickEpisodeFromDom();

  return { title, posterUrl, episode };
}
