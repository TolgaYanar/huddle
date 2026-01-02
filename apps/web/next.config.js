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
    // Use afterFiles so any existing Next route handlers (e.g. /api/url-preview)
    // continue to work.
    return {
      afterFiles: [
        {
          source: "/api/:path*",
          destination: `${target}/api/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
