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

// Single source of truth for origin checks, shared by express cors and
// socket.io. With an empty allowlist, dev reflects the request origin but
// production fails closed (credentials: true makes reflection dangerous).
function createOriginCheck({
  allowedOrigins,
  allowExtensionOrigins,
  isProduction,
}) {
  const list = Array.isArray(allowedOrigins) ? allowedOrigins : [];

  return function originCheck(origin, callback) {
    // Allow non-browser clients (no Origin header) like curl/mobile.
    if (!origin) return callback(null, true);

    // Optionally allow browser extension origins (Chrome/Firefox).
    if (allowExtensionOrigins && isExtensionOrigin(origin)) {
      return callback(null, true);
    }

    // No allowlist: reflect-request-origin in dev only; deny in production.
    if (list.length === 0) return callback(null, !isProduction);

    const normalizedOrigin = String(origin)
      .toLowerCase()
      .replace(/\/+$/, "");
    return callback(null, list.includes(normalizedOrigin));
  };
}

function createCorsOptions({
  allowedOrigins,
  allowExtensionOrigins,
  methods,
  isProduction = false,
}) {
  const httpMethods = Array.isArray(methods) ? methods : ["GET", "POST"];

  return {
    origin: createOriginCheck({
      allowedOrigins,
      allowExtensionOrigins,
      isProduction,
    }),
    credentials: true,
    methods: httpMethods,
  };
}

module.exports = {
  parseAllowedOrigins,
  isExtensionOrigin,
  readBooleanEnv,
  createOriginCheck,
  createCorsOptions,
};
