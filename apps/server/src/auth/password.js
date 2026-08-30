const crypto = require("crypto");

const MAX_PASSWORD_LENGTH = 200;

function normalizePassword(password) {
  const normalized = String(password ?? "");
  if (normalized.length > MAX_PASSWORD_LENGTH) return null;
  return normalized;
}

function deriveKey(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(password), salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

async function hashPassword(password) {
  const normalized = normalizePassword(password);
  if (normalized === null) {
    throw new RangeError(`Password exceeds ${MAX_PASSWORD_LENGTH} characters`);
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = (await deriveKey(normalized, salt)).toString("hex");
  return `${salt}:${hash}`;
}

async function verifyPassword(password, stored) {
  if (!stored) return false;
  const normalized = normalizePassword(password);
  if (normalized === null) return false;
  const parts = String(stored).split(":");
  if (parts.length !== 2) return false;
  const [salt, hashHex] = parts;
  if (!/^[a-f\d]{32}$/i.test(salt || "")) return false;
  if (!/^[a-f\d]{128}$/i.test(hashHex || "")) return false;

  try {
    const expected = Buffer.from(hashHex, "hex");
    const computed = await deriveKey(normalized, salt);
    return crypto.timingSafeEqual(expected, computed);
  } catch {
    return false;
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
};
