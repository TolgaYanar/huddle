/* global process */
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["shared-logic", "@repo/ui"],
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
        // Socket.IO (polling + websocket upgrade)
        // Proxying through the web origin helps ensure the browser sends the
        // HttpOnly session cookie during the Socket.IO handshake.
        // Socket.IO clients may request both `/socket.io` and `/socket.io/*`.
        // Proxy both forms to avoid Next.js redirects (e.g. 308) that break
        // WebSocket handshakes.
        {
          source: "/socket.io",
          destination: `${target}/socket.io`,
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
    };
  },
};

export default nextConfig;
