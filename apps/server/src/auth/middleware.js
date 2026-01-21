function createRequireAuth({ getAuthUser }) {
  return async function requireAuth(req, res, next) {
    try {
      const user = await getAuthUser(req);
      if (!user) return res.status(401).json({ error: "unauthorized" });
      req.authUser = user;
      return next();
    } catch (err) {
      console.error("Auth error:", err);
      return res.status(500).json({ error: "auth_error" });
    }
  };
}

module.exports = {
  createRequireAuth,
};
