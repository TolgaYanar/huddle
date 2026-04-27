const { createRateLimiter } = require("../auth/rateLimiter");

// 10 login attempts per 15 minutes per IP.
const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "too_many_login_attempts",
});

// 5 registration attempts per hour per IP.
const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: "too_many_register_attempts",
});

function registerAuthRoutes(
  app,
  {
    isDbConnected,
    getPrisma,
    getAuthUser,
    createSessionForUser,
    setSessionCookie,
    clearSessionCookie,
    validateUsername,
    validatePassword,
    validatePasswordForLogin,
    hashPassword,
    verifyPassword,
    SESSION_COOKIE_NAME,
    parseCookies,
    sha256Hex,
  },
) {
  // Shared: validate inputs, create user, return { user, token, expiresAt }.
  async function createUser(body) {
    const username = validateUsername(body?.username);
    const password = validatePassword(body?.password);
    if (!username) {
      return {
        err: { status: 400, body: { error: "invalid_username", hint: "3-20 chars: a-z 0-9 _" } },
      };
    }
    if (!password) {
      return {
        err: { status: 400, body: { error: "invalid_password", hint: "min 8 characters" } },
      };
    }

    const user = await getPrisma().user.create({
      data: { username, passwordHash: hashPassword(password) },
      select: { id: true, username: true, createdAt: true },
    });

    const { token, expiresAt } = await createSessionForUser(user.id);
    return { user, token, expiresAt };
  }

  // Shared: validate credentials, find user, verify password, return { user, token, expiresAt }.
  async function authenticateUser(body) {
    const username = validateUsername(body?.username);
    const password = validatePasswordForLogin(body?.password);
    if (!username || !password) {
      return { err: { status: 400, body: { error: "invalid_credentials" } } };
    }

    const user = await getPrisma().user.findUnique({
      where: { username },
      select: { id: true, username: true, passwordHash: true, createdAt: true },
    });

    const ok = user ? verifyPassword(password, user.passwordHash) : false;
    if (!ok) return { err: { status: 401, body: { error: "invalid_credentials" } } };

    const { token, expiresAt } = await createSessionForUser(user.id);
    return {
      user: { id: user.id, username: user.username, createdAt: user.createdAt },
      token,
      expiresAt,
    };
  }

  // Use req.log when present (request-id middleware), fall back to console.
  function logErr(req, msg, err) {
    const log = req.log?.error || console.error;
    log(msg, err);
  }

  app.get("/api/auth/me", async (req, res) => {
    try {
      const user = await getAuthUser(req);
      return res.json({ user });
    } catch (err) {
      logErr(req, "/api/auth/me failed:", err);
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/auth/register", registerLimiter, async (req, res) => {
    try {
      if (!isDbConnected() || !getPrisma()) {
        return res.status(503).json({ error: "db_unavailable" });
      }
      const result = await createUser(req.body);
      if (result.err) return res.status(result.err.status).json(result.err.body);
      setSessionCookie(req, res, result.token);
      return res.json({ user: result.user });
    } catch (err) {
      if (err && err.code === "P2002") {
        return res.status(409).json({ error: "username_taken" });
      }
      logErr(req, "/api/auth/register failed:", err);
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/auth/login", loginLimiter, async (req, res) => {
    try {
      if (!isDbConnected() || !getPrisma()) {
        return res.status(503).json({ error: "db_unavailable" });
      }
      const result = await authenticateUser(req.body);
      if (result.err) return res.status(result.err.status).json(result.err.body);
      setSessionCookie(req, res, result.token);
      return res.json({ user: result.user });
    } catch (err) {
      logErr(req, "/api/auth/login failed:", err);
      return res.status(500).json({ error: "server_error" });
    }
  });

  // Token-returning variants (recommended for mobile).
  app.post("/api/auth/register-token", registerLimiter, async (req, res) => {
    try {
      if (!isDbConnected() || !getPrisma()) {
        return res.status(503).json({ error: "db_unavailable" });
      }
      const result = await createUser(req.body);
      if (result.err) return res.status(result.err.status).json(result.err.body);
      return res.json({ user: result.user, token: result.token, expiresAt: result.expiresAt });
    } catch (err) {
      if (err && err.code === "P2002") {
        return res.status(409).json({ error: "username_taken" });
      }
      logErr(req, "/api/auth/register-token failed:", err);
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/auth/login-token", loginLimiter, async (req, res) => {
    try {
      if (!isDbConnected() || !getPrisma()) {
        return res.status(503).json({ error: "db_unavailable" });
      }
      const result = await authenticateUser(req.body);
      if (result.err) return res.status(result.err.status).json(result.err.body);
      return res.json({ user: result.user, token: result.token, expiresAt: result.expiresAt });
    } catch (err) {
      logErr(req, "/api/auth/login-token failed:", err);
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    try {
      if (isDbConnected() && getPrisma()) {
        let token = null;

        const authHeader = req.headers.authorization;
        if (authHeader && typeof authHeader === "string") {
          const match = authHeader.match(/^Bearer\s+(.+)$/i);
          if (match && match[1]) token = match[1].trim();
        }

        if (!token) {
          const cookies = parseCookies(req.headers.cookie);
          token = cookies[SESSION_COOKIE_NAME] || null;
        }

        if (token) {
          const tokenHash = sha256Hex(token);
          await getPrisma().session.deleteMany({ where: { tokenHash } });
        }
      }
      clearSessionCookie(req, res);
      return res.json({ ok: true });
    } catch (err) {
      logErr(req, "/api/auth/logout failed:", err);
      clearSessionCookie(req, res);
      return res.json({ ok: true });
    }
  });
}

module.exports = {
  registerAuthRoutes,
};
