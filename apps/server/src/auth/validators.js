function validateUsername(raw) {
  const username = String(raw || "")
    .trim()
    .toLowerCase();
  if (username.length < 3 || username.length > 20) return null;
  if (!/^[a-z0-9_]+$/.test(username)) return null;
  return username;
}

function validatePassword(raw) {
  const password = String(raw || "");
  if (password.length < 8 || password.length > 200) return null;
  // Require at least one lowercase, one uppercase, and one digit
  if (!/[a-z]/.test(password)) return null;
  if (!/[A-Z]/.test(password)) return null;
  if (!/\d/.test(password)) return null;
  return password;
}

function validatePasswordForLogin(raw) {
  // Login should accept any password shape and defer to hash verification.
  // We only enforce a reasonable length bound.
  const password = String(raw || "");
  if (password.length < 1 || password.length > 200) return null;
  return password;
}

function validateRoomId(raw) {
  const roomId = String(raw || "").trim();
  if (!roomId) return null;
  if (roomId.length > 200) return null;
  // Must be URL-safe: letters, digits, underscore, hyphen.
  // Mirrors the client-side normalization in the web home page.
  if (!/^[a-zA-Z0-9_-]+$/.test(roomId)) return null;
  return roomId;
}

module.exports = {
  validateUsername,
  validatePassword,
  validatePasswordForLogin,
  validateRoomId,
};
