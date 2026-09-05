/* global process */
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["shared-logic"],
  poweredByHeader: false,
  env: {
    // Public build identifier only; never place secrets here. Vercel exposes
    // its git SHA at build time, while local/other deployments may override it.
    NEXT_PUBLIC_APP_RELEASE:
      process.env.NEXT_PUBLIC_APP_RELEASE ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      "",
  },
  // Socket.IO WebSocket upgrades cannot follow redirects.
  // Vercel/Next may normalize trailing slashes with a 308 which breaks the
  // Engine.IO websocket handshake on `/socket.io/`.
  skipTrailingSlashRedirect: true,
  async headers() {
    // Apply baseline security headers to every page response.
    // /socket.io and /api/* are matched by rewrites (beforeFiles) and forwarded
    // to the upstream server before headers() runs, so these only affect the
    // Next.js HTML/asset responses.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), geolocation=()",
          },
        ],
      },
    ];
  },
  async rewrites() {
    const rawTarget =
      process.env.API_PROXY_TARGET ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      process.env.NEXT_PUBLIC_SOCKET_SERVER_URL;

    if (!rawTarget) return [];

    const target = String(rawTarget)
      .trim()
      .replace(/^ws:/i, "http:")
      .replace(/^wss:/i, "https:")
      .replace(/\/$/, "");

    // Proxy backend REST API under the web origin.
    // Use beforeFiles to ensure these routes are proxied BEFORE Next.js looks
    // for local API route handlers. Only proxy specific backend routes.
    return {
      beforeFiles: [
        // Debug/monitoring helper: proxy the server health check
        {
          source: "/health",
          destination: `${target}/health`,
        },
        // Socket.IO (polling + websocket upgrade)
        // Proxying through the web origin helps ensure the browser sends the
        // HttpOnly session cookie during the Socket.IO handshake.
        // Socket.IO clients may request both `/socket.io` and `/socket.io/*`.
        // Proxy both forms to avoid Next.js redirects (e.g. 308) that break
        // WebSocket handshakes.
        {
          source: "/socket.io",
          destination: `${target}/socket.io/`,
        },
        {
          source: "/socket.io/",
          destination: `${target}/socket.io/`,
        },
        {
          source: "/socket.io/:path*",
          destination: `${target}/socket.io/:path*`,
        },
        // Auth endpoints
        {
          source: "/api/auth/:path*",
          destination: `${target}/api/auth/:path*`,
        },
        // Sync-quality telemetry
        {
          source: "/api/telemetry/:path*",
          destination: `${target}/api/telemetry/:path*`,
        },
        {
          source: "/api/webrtc/:path*",
          destination: `${target}/api/webrtc/:path*`,
        },
        // Saved rooms endpoints
        {
          source: "/api/saved-rooms/:path*",
          destination: `${target}/api/saved-rooms/:path*`,
        },
        {
          source: "/api/saved-rooms",
          destination: `${target}/api/saved-rooms`,
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

// Source maps are uploaded to Sentry only when CI supplies the credentials.
// Without SENTRY_AUTH_TOKEN the config is exported untouched, so a local build
// and a deployment with no Sentry project behave exactly as before — the
// plugin is not even loaded.
//
// SENTRY_AUTH_TOKEN is the one value here that is genuinely secret; the DSN is
// a public identifier and ships in the client bundle by design.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const sentryOrg = process.env.SENTRY_ORG;
const sentryProject = process.env.SENTRY_PROJECT;

async function withOptionalSentry(config) {
  if (!sentryAuthToken || !sentryOrg || !sentryProject) return config;

  const { withSentryConfig } = await import("@sentry/nextjs/config");
  return withSentryConfig(config, {
    org: sentryOrg,
    project: sentryProject,
    authToken: sentryAuthToken,
    silent: true,
    // Strip the maps from the deployed assets after upload: they are for
    // Sentry to resolve stack traces, not for visitors to download.
    sourcemaps: { deleteSourcemapsAfterUpload: true },
    // The SDK's own instrumentation of Vercel Cron and tunnelling is not used
    // here; keep the build output minimal.
    disableLogger: true,
  });
}

export default await withOptionalSentry(nextConfig);
