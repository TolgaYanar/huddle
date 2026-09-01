import type { Event } from "@sentry/nextjs";

export function isValidSentryDsn(dsn: string | undefined): dsn is string {
  if (!dsn) return false;
  try {
    const url = new URL(dsn);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      Boolean(url.username) &&
      Boolean(url.hostname) &&
      /^\d+$/.test(url.pathname.replace(/^\/+/, ""))
    );
  } catch {
    return false;
  }
}

export function scrubSentryEvent<T extends Event>(event: T): T {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.query_string;
    delete event.request.data;
    delete event.request.url;
    delete event.request.env;
  }
  delete event.user;
  delete event.breadcrumbs;
  return event;
}
