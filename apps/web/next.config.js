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
