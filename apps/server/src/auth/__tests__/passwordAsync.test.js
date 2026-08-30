const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const { hashPassword, verifyPassword } = require("../password");

describe("async password hashing", () => {
  it("hashes and verifies without invoking the synchronous scrypt API", async () => {
    const originalScryptSync = crypto.scryptSync;
    crypto.scryptSync = () => {
      throw new Error("scryptSync must not run on the event loop");
    };

    try {
      const stored = await hashPassword("CorrectHorse7");
      assert.match(stored, /^[a-f\d]{32}:[a-f\d]{128}$/);
      assert.equal(await verifyPassword("CorrectHorse7", stored), true);
      assert.equal(await verifyPassword("wrong-password", stored), false);
    } finally {
      crypto.scryptSync = originalScryptSync;
    }
  });

  it("rejects malformed stored hashes without running scrypt", async () => {
    assert.equal(await verifyPassword("password", "bad"), false);
    assert.equal(await verifyPassword("password", "zz:11"), false);
    assert.equal(
      await verifyPassword(
        "password",
        `${"a".repeat(32)}:${"b".repeat(128)}:extra`,
      ),
      false,
    );
    assert.equal(await verifyPassword("password", null), false);
  });

  it("rejects oversized inputs before submitting scrypt work", async () => {
    const stored = `${"a".repeat(32)}:${"b".repeat(128)}`;
    assert.equal(await verifyPassword("x".repeat(201), stored), false);
    await assert.rejects(
      hashPassword("x".repeat(201)),
      /exceeds 200 characters/,
    );
  });
});
