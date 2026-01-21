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
  app.get("/api/auth/me", async (req, res) => {
    try {
      const user = await getAuthUser(req);
      return res.json({ user });
    } catch (err) {
      console.error("/api/auth/me failed:", err);
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/auth/register", async (req, res) => {
    try {
      if (!isDbConnected() || !getPrisma()) {
        return res.status(503).json({ error: "db_unavailable" });
      }

      const username = validateUsername(req.body?.username);
      const password = validatePassword(req.body?.password);
      if (!username) {
        return res
          .status(400)
          .json({ error: "invalid_username", hint: "3-20 chars: a-z 0-9 _" });
      }
      if (!password) {
        return res
          .status(400)
          .json({ error: "invalid_password", hint: "min 8 characters" });
      }

      const user = await getPrisma().user.create({
        data: {
          username,
          passwordHash: hashPassword(password),
        },
        select: { id: true, username: true, createdAt: true },
      });

      const { token } = await createSessionForUser(user.id);

      setSessionCookie(req, res, token);
      return res.json({ user });
    } catch (err) {
      if (err && err.code === "P2002") {
        return res.status(409).json({ error: "username_taken" });
      }
      console.error("/api/auth/register failed:", err);
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      if (!isDbConnected() || !getPrisma()) {
        return res.status(503).json({ error: "db_unavailable" });
      }

      const username = validateUsername(req.body?.username);
      const password = validatePasswordForLogin(req.body?.password);
      if (!username || !password) {
        return res.status(400).json({ error: "invalid_credentials" });
      }

      const user = await getPrisma().user.findUnique({
        where: { username },
        select: {
          id: true,
          username: true,
          passwordHash: true,
          createdAt: true,
        },
      });

      const ok = user ? verifyPassword(password, user.passwordHash) : false;
      if (!ok) return res.status(401).json({ error: "invalid_credentials" });

      const { token } = await createSessionForUser(user.id);

      setSessionCookie(req, res, token);
      return res.json({
        user: {
          id: user.id,
          username: user.username,
          createdAt: user.createdAt,
        },
      });
    } catch (err) {
      console.error("/api/auth/login failed:", err);
      return res.status(500).json({ error: "server_error" });
    }
  });

  // Token-returning variants (recommended for mobile).
  app.post("/api/auth/register-token", async (req, res) => {
    try {
      if (!isDbConnected() || !getPrisma()) {
        return res.status(503).json({ error: "db_unavailable" });
      }

      const username = validateUsername(req.body?.username);
      const password = validatePassword(req.body?.password);
      if (!username) {
        return res
          .status(400)
          .json({ error: "invalid_username", hint: "3-20 chars: a-z 0-9 _" });
      }
      if (!password) {
        return res
          .status(400)
          .json({ error: "invalid_password", hint: "min 8 characters" });
      }

      const user = await getPrisma().user.create({
        data: {
          username,
          passwordHash: hashPassword(password),
        },
        select: { id: true, username: true, createdAt: true },
      });

      const { token, expiresAt } = await createSessionForUser(user.id);
      return res.json({ user, token, expiresAt });
    } catch (err) {
      if (err && err.code === "P2002") {
        return res.status(409).json({ error: "username_taken" });
      }
      console.error("/api/auth/register-token failed:", err);
      return res.status(500).json({ error: "server_error" });
    }
  });

  app.post("/api/auth/login-token", async (req, res) => {
    try {
      if (!isDbConnected() || !getPrisma()) {
        return res.status(503).json({ error: "db_unavailable" });
      }

      const username = validateUsername(req.body?.username);
      const password = validatePasswordForLogin(req.body?.password);
      if (!username || !password) {
        return res.status(400).json({ error: "invalid_credentials" });
      }

      const user = await getPrisma().user.findUnique({
        where: { username },
        select: {
          id: true,
          username: true,
          passwordHash: true,
          createdAt: true,
        },
      });

      const ok = user ? verifyPassword(password, user.passwordHash) : false;
      if (!ok) return res.status(401).json({ error: "invalid_credentials" });

      const { token, expiresAt } = await createSessionForUser(user.id);
      return res.json({
        user: {
          id: user.id,
          username: user.username,
          createdAt: user.createdAt,
        },
        token,
        expiresAt,
      });
    } catch (err) {
      console.error("/api/auth/login-token failed:", err);
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
      console.error("/api/auth/logout failed:", err);
      clearSessionCookie(req, res);
      return res.json({ ok: true });
    }
  });
}

module.exports = {
  registerAuthRoutes,
};
