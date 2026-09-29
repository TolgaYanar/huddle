import { NextResponse, type NextRequest } from "next/server";

import { buildUpstreamHeaders } from "./app/lib/forwardedClient";

// Runs before the beforeFiles rewrites in next.config.js and forwards the
// user's address to the backend's per-client rate limits. Deliberately not on
// /socket.io: nothing there needs it, and it would put a function in front of
// every websocket upgrade.
export function proxy(request: NextRequest) {
  return NextResponse.next({
    request: {
      headers: buildUpstreamHeaders(
        request.headers,
        process.env.PROXY_SHARED_SECRET,
      ),
    },
  });
}

export const config = {
  matcher: ["/api/auth/:path*", "/api/webrtc/:path*", "/api/telemetry/:path*"],
};
