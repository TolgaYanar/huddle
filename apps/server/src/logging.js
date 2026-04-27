const crypto = require("crypto");

const VERBOSE_LOGS =
  String(process.env.VERBOSE_LOGS || "").trim() === "1" ||
  String(process.env.VERBOSE_LOGS || "")
    .trim()
    .toLowerCase() === "true";

function vLog(...args) {
  if (!VERBOSE_LOGS) return;
  // eslint-disable-next-line no-console
  console.log(...args);
}

/**
 * Tag every request with a short id, expose it on the response, and surface a
 * `req.log` helper that prepends the id to messages. Lets us correlate logs
 * across socket auth, route handlers, and downstream errors.
 */
function requestId() {
  return function requestIdMiddleware(req, res, next) {
    const incoming = req.headers["x-request-id"];
    const id =
      typeof incoming === "string" && /^[A-Za-z0-9_-]{4,128}$/.test(incoming)
        ? incoming
        : crypto.randomBytes(8).toString("hex");

    req.id = id;
    res.setHeader("X-Request-Id", id);

    req.log = {
      info: (...args) => {
        if (!VERBOSE_LOGS) return;
        // eslint-disable-next-line no-console
        console.log(`[${id}]`, ...args);
      },
      warn: (...args) => {
        // eslint-disable-next-line no-console
        console.warn(`[${id}]`, ...args);
      },
      error: (...args) => {
        // eslint-disable-next-line no-console
        console.error(`[${id}]`, ...args);
      },
    };

    next();
  };
}

module.exports = {
  VERBOSE_LOGS,
  vLog,
  requestId,
};
