/**
 * Lightweight security-headers middleware (no external dependencies).
 * Sets a sensible default set of HTTP headers for an API server that is
 * also occasionally accessed directly (e.g. /health) in a browser.
 */
function securityHeaders() {
  return function securityHeadersMiddleware(req, res, next) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-DNS-Prefetch-Control", "off");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    if (process.env.NODE_ENV === "production") {
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=63072000; includeSubDomains; preload",
      );
    }
    next();
  };
}

module.exports = { securityHeaders };
