const { createSocketRateLimiter } = require("../helpers/socketRateLimit");

const MAX_USERNAME_LENGTH = 30;

function attachUsernameHandlers(io, state, socket) {
  // Per-socket rate limit: max 10 username changes per 10s. Each change
  // emits username_changed to every room the socket is in, so this is
  // genuinely a fan-out vector worth bounding.
  const limiter = createSocketRateLimiter({ windowMs: 10000, max: 10 });

  socket.on("set_username", (data) => {
    if (!limiter()) return;

    const { username } = data || {};
    const trimmed =
      typeof username === "string"
        ? username.trim().slice(0, MAX_USERNAME_LENGTH)
        : "";

    if (trimmed) {
      state.socketIdToUsername.set(socket.id, trimmed);
    } else {
      state.socketIdToUsername.delete(socket.id);
    }

    const payload = { socketId: socket.id, username: trimmed || null };

    // Notify all rooms this socket is in
    for (const room of socket.rooms) {
      if (room === socket.id) continue;
      io.to(room).emit("username_changed", payload);
    }

    // Echo back to sender so their own usernamesById entry updates
    socket.emit("username_changed", payload);
  });
}

module.exports = { attachUsernameHandlers };
