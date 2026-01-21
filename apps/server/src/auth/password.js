const crypto = require("crypto");

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const [salt, hashHex] = String(stored).split(":");
  if (!salt || !hashHex) return false;
  const computed = crypto
    .scryptSync(String(password ?? ""), salt, 64)
    .toString("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(hashHex, "hex"),
      Buffer.from(computed, "hex"),
    );
  } catch {
    return false;
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
};
