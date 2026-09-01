/**
 * Server-side exception reporting.
 *
 * Inert without SENTRY_DSN, so this ships and deploys before any Sentry
 * project exists — nothing to configure, nothing to break. The DSN is a public
 * identifier by design; the value that must stay secret is the source-map
 * upload token, which only CI needs.
 *
 * Deliberately narrow: exceptions only. Performance tracing and profiling are
 * off because sync quality already has a purpose-built path in src/telemetry,
 * and PII is off because rooms are joinable by guests.
 */

let initialized = false;

function scrubEvent(event) {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.data;
    delete event.request.query_string;
    delete event.request.url;
    delete event.request.fragment;
    delete event.request.env;
  }
  // Breadcrumb data commonly contains navigation and fetch URLs. Exceptions
  // and stacks are sufficient for grouping without retaining that history.
  delete event.breadcrumbs;
  delete event.user;
  return event;
}

/**
 * Sentry.init() accepts a malformed DSN, logs, and carries on — which would
 * leave isSentryEnabled() reporting true while nothing is actually delivered.
 * Check the shape first so "enabled" means "will report".
 */
function isValidDsn(dsn) {
  if (typeof dsn !== "string" || !dsn) return false;
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\/+/, "");
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      Boolean(url.username) &&
      Boolean(url.hostname) &&
      /^\d+$/.test(projectId)
    );
  } catch {
    return false;
  }
}

function initSentry({
  dsn = process.env.SENTRY_DSN,
  environment = process.env.NODE_ENV || "development",
  release = process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.SENTRY_RELEASE ||
    undefined,
  logError = console.warn,
} = {}) {
  if (initialized) return true;
  if (!isValidDsn(dsn)) {
    if (dsn) logError("Sentry disabled: DSN is not a valid Sentry URL");
    return false;
  }

  try {
    // Required lazily: with no DSN the SDK is never loaded, so a deployment
    // that does not use Sentry pays nothing for it.
    const Sentry = require("@sentry/node");
    Sentry.init({
      dsn,
      environment,
      release,
      sendDefaultPii: false,
      tracesSampleRate: 0,
      profilesSampleRate: 0,
      // A room id is not personal data, but a title or a URL can be, and both
      // reach error messages. Strip request context and user entirely.
      beforeSend: scrubEvent,
    });
    initialized = true;
    return true;
  } catch (err) {
    // Never let observability setup stop the server from starting.
    logError("Sentry init failed:", err.message);
    return false;
  }
}

function captureServerError(error, context) {
  if (!initialized) return false;
  try {
    const Sentry = require("@sentry/node");
    Sentry.captureException(error, context ? { extra: context } : undefined);
    return true;
  } catch {
    return false;
  }
}

function isSentryEnabled() {
  return initialized;
}

// Test seam: the module-level flag would otherwise leak between cases.
function resetSentryForTests() {
  initialized = false;
}

module.exports = {
  captureServerError,
  isValidDsn,
  initSentry,
  isSentryEnabled,
  resetSentryForTests,
  scrubEvent,
};
