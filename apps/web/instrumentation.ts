import { isValidSentryDsn, scrubSentryEvent } from "./sentryConfig";

/**
 * Next.js server-side instrumentation hook.
 *
 * Inert without NEXT_PUBLIC_SENTRY_DSN, so the app builds, deploys and runs
 * with no Sentry project configured. Nothing here is required for the product
 * to work; it only makes failures visible.
 */
export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!isValidSentryDsn(dsn)) return;

  const Sentry = await import("@sentry/nextjs");
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_APP_RELEASE,
    sendDefaultPii: false,
    // Sync quality has a purpose-built collector in hooks/useSyncTelemetry;
    // tracing here would duplicate it at far higher cost and volume.
    tracesSampleRate: 0,
    maxBreadcrumbs: 0,
    beforeSend: scrubSentryEvent,
  });
}

export async function onRequestError(
  ...args: Parameters<typeof import("@sentry/nextjs").captureRequestError>
) {
  if (!isValidSentryDsn(process.env.NEXT_PUBLIC_SENTRY_DSN)) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
}
