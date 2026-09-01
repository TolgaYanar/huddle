import { isValidSentryDsn, scrubSentryEvent } from "./sentryConfig";

/**
 * Browser-side error reporting.
 *
 * The SDK is imported dynamically and only when NEXT_PUBLIC_SENTRY_DSN is set.
 * A static import would put roughly half a megabyte of Sentry into the bundle
 * of every visitor even with reporting switched off — "inert" has to mean not
 * downloaded, not merely not running.
 *
 * Session Replay and tracing are off: a watch party puts the video title, the
 * room name and the chat on screen, and replay would capture all of it.
 */

type SentryModule = typeof import("@sentry/nextjs");

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

const sentryReady: Promise<SentryModule | null> = isValidSentryDsn(dsn)
  ? import("@sentry/nextjs")
      .then((Sentry) => {
        Sentry.init({
          dsn,
          environment: process.env.NODE_ENV,
          release: process.env.NEXT_PUBLIC_APP_RELEASE,
          sendDefaultPii: false,
          tracesSampleRate: 0,
          replaysSessionSampleRate: 0,
          replaysOnErrorSampleRate: 0,
          maxBreadcrumbs: 0,
          beforeSend: scrubSentryEvent,
        });
        return Sentry;
      })
      .catch(() => null)
  : Promise.resolve(null);

/**
 * Next calls this on every client-side navigation. It must exist as an export
 * regardless, so it forwards to the SDK once loaded and does nothing when
 * Sentry is not configured.
 */
export function onRouterTransitionStart(
  ...args: Parameters<SentryModule["captureRouterTransitionStart"]>
) {
  if (!isValidSentryDsn(dsn)) return;
  void sentryReady.then((Sentry) =>
    Sentry?.captureRouterTransitionStart(...args),
  );
}
