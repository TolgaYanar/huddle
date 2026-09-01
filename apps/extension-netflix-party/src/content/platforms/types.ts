// These ids are sent verbatim as the telemetry `platform` field, so each one
// must be a token the server records distinctly. Anything else is coerced to
// "other" (see server src/telemetry/syncMetric.js), which would silently merge
// a platform's sync quality with every unknown source — the exact blind spot
// the telemetry exists to remove. Hence "disney_plus", not "disney".
export type PlatformId = "netflix" | "prime" | "disney_plus";

export type PlatformMetadata = {
  title: string | null;
  posterUrl: string | null;
  episode: string | null;
};

export type PlatformCommandResult = {
  ok: boolean;
  error?: string;
};

/**
 * Provisional player boundary, derived from measured Netflix and Prime
 * behaviour. It must be reviewed against a third platform before it is
 * treated as stable.
 *
 * Netflix needs privileged position/play commands; Prime does not. Prime,
 * however, reuses one <video> and leaves the URL stale between episodes, so a
 * possible content change and the act of re-reading identity are deliberately
 * separate capabilities.
 */
export type PlatformAdapter = {
  id: PlatformId;
  displayName: string;

  matchesOrigin: (url: string) => boolean;
  isPlaybackUrl: (url: string) => boolean;
  getPlayer: () => HTMLVideoElement | null;

  /** Best-effort identity encoded in a URL, if that platform has one. */
  getContentIdFromUrl: (url: string) => string | null;
  /** Current identity from the live player/page; may intentionally fail closed. */
  getCurrentContentId: () => string | null;
  formatContentId: (contentId: string) => string;
  /** Returns null when the platform cannot safely navigate to this identity. */
  getNavigationUrl: (
    targetUrl: string,
    expectedContentId: string,
  ) => string | null;
  /**
   * Prime-only requirement discovered by the spike: its URL can stay stale
   * after an episode change, so sync must stop when live identity is unknown.
   * Netflix keeps its existing best-effort behaviour by setting this false.
   */
  requiresVerifiedContentIdentity: boolean;

  getMetadata: () => PlatformMetadata;
  seek: (seconds: number) => Promise<PlatformCommandResult>;
  play: () => Promise<PlatformCommandResult>;

  /**
   * Notifies that identity may have changed; callers must re-read it. The
   * signal itself is never an identity (two episodes can share a duration).
   */
  subscribeToPotentialContentChanges: (
    onPotentialChange: () => void,
  ) => () => void;
};
