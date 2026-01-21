function parseAllowedOrigins(value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((origin) => String(origin).toLowerCase().replace(/\/+$/, ""));
}

function isExtensionOrigin(origin) {
  const o = String(origin || "").toLowerCase();
  return (
    o.startsWith("chrome-extension://") || o.startsWith("moz-extension://")
  );
}

function readBooleanEnv(name) {
  const raw = String(process.env[name] || "").trim();
  return raw === "1" || raw.toLowerCase() === "true";
}

function createCorsOptions({ allowedOrigins, allowExtensionOrigins, methods }) {
  const list = Array.isArray(allowedOrigins) ? allowedOrigins : [];
  const httpMethods = Array.isArray(methods) ? methods : ["GET", "POST"];

  return {
    origin(origin, callback) {
      const normalizedOrigin = String(origin || "")
        .toLowerCase()
        .replace(/\/+$/, "");

      // Allow non-browser clients (no Origin header) like curl/mobile.
      if (!origin) return callback(null, true);

      // Optionally allow browser extension origins (Chrome/Firefox).
      if (allowExtensionOrigins && isExtensionOrigin(origin)) {
        return callback(null, true);
      }

      // If no allowlist provided, reflect-request-origin (dev-friendly).
      if (list.length === 0) return callback(null, true);

      return callback(null, list.includes(normalizedOrigin));
    },
    credentials: true,
    methods: httpMethods,
  };
}

module.exports = {
  parseAllowedOrigins,
  isExtensionOrigin,
  readBooleanEnv,
  createCorsOptions,
};
