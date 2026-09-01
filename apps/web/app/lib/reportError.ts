import { isValidSentryDsn } from "../../sentryConfig";

/**
 * Report a caught error to Sentry, if Sentry is configured.
 *
 * A no-op without NEXT_PUBLIC_SENTRY_DSN, and the SDK is imported lazily so
 * a build with no DSN never pulls it into the calling chunk. Never throws and
 * never rejects: a failure to report an error must not become a second error.
 */
export async function reportError(
  error: unknown,
  context?: Record<string, unknown>,
): Promise<boolean> {
  if (!isValidSentryDsn(process.env.NEXT_PUBLIC_SENTRY_DSN)) return false;

  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureException(error, context ? { extra: context } : undefined);
    return true;
  } catch {
    return false;
  }
}
