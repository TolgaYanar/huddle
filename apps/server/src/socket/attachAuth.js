// Attach auth user to socket at connection time (cookie or Bearer token).
function attachSocketAuth(io, state, { getAuthUser }) {
  io.use(async (socket, next) => {
    try {
      const headers = { ...(socket.handshake?.headers || {}) };

      // Mobile can pass a token via socket auth (or it can be provided as an Authorization header).
      const token = socket.handshake?.auth?.token;
      if (token && typeof token === "string" && token.trim()) {
        headers.authorization = `Bearer ${token.trim()}`;
      }

      const user = await getAuthUser({ headers });
      socket.data.authUser = user;

      if (user?.username) {
        state.socketIdToUsername.set(socket.id, user.username);
      }
    } catch {
      // Best-effort only; chat still works without auth.
    }
    return next();
  });
}

module.exports = {
  attachSocketAuth,
};
