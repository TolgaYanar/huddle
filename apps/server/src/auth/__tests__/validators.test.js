const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  validateUsername,
  validatePassword,
  validatePasswordForLogin,
  validateRoomId,
} = require("../validators");

// ---------------------------------------------------------------------------
// validateUsername
// ---------------------------------------------------------------------------
describe("validateUsername", () => {
  it("accepts a valid lowercase username", () => {
    assert.equal(validateUsername("alice"), "alice");
  });

  it("accepts alphanumeric + underscore", () => {
    assert.equal(validateUsername("user_42"), "user_42");
  });

  it("trims whitespace and lowercases", () => {
    assert.equal(validateUsername("  Bob  "), "bob");
  });

  it("rejects usernames shorter than 3 chars", () => {
    assert.equal(validateUsername("ab"), null);
  });

  it("rejects empty string", () => {
    assert.equal(validateUsername(""), null);
  });

  it("rejects usernames longer than 20 chars", () => {
    assert.equal(validateUsername("a".repeat(21)), null);
  });

  it("accepts exactly 20 chars", () => {
    assert.equal(validateUsername("a".repeat(20)), "a".repeat(20));
  });

  it("accepts exactly 3 chars", () => {
    assert.equal(validateUsername("abc"), "abc");
  });

  it("rejects uppercase letters (post-lowercasing they become valid — but raw uppercase is normalised)", () => {
    // Uppercase is lowercased, so "ABC" -> "abc" which is valid
    assert.equal(validateUsername("ABC"), "abc");
  });

  it("rejects special characters", () => {
    assert.equal(validateUsername("user!name"), null);
  });

  it("rejects spaces within username", () => {
    assert.equal(validateUsername("user name"), null);
  });

  it("rejects null-like input gracefully", () => {
    assert.equal(validateUsername(null), null);
    assert.equal(validateUsername(undefined), null);
  });
});

// ---------------------------------------------------------------------------
// validatePassword
// ---------------------------------------------------------------------------
describe("validatePassword", () => {
  it("accepts a valid password", () => {
    assert.equal(validatePassword("Secure1!"), "Secure1!");
  });

  it("accepts minimum valid password", () => {
    assert.equal(validatePassword("Abcdef1!"), "Abcdef1!");
  });

  it("rejects passwords shorter than 8 chars", () => {
    assert.equal(validatePassword("Ab1!"), null);
  });

  it("rejects passwords longer than 200 chars", () => {
    assert.equal(validatePassword("Aa1" + "x".repeat(199)), null);
  });

  it("rejects password without uppercase", () => {
    assert.equal(validatePassword("alllower1"), null);
  });

  it("rejects password without lowercase", () => {
    assert.equal(validatePassword("ALLUPPER1"), null);
  });

  it("rejects password without a digit", () => {
    assert.equal(validatePassword("NoDigitsHere"), null);
  });

  it("accepts password with exactly 8 chars meeting all rules", () => {
    assert.equal(validatePassword("Passw0rd"), "Passw0rd");
  });

  it("handles null/undefined gracefully", () => {
    assert.equal(validatePassword(null), null);
    assert.equal(validatePassword(undefined), null);
  });
});

// ---------------------------------------------------------------------------
// validatePasswordForLogin
// ---------------------------------------------------------------------------
describe("validatePasswordForLogin", () => {
  it("accepts any non-empty password up to 200 chars", () => {
    assert.equal(validatePasswordForLogin("anything"), "anything");
    assert.equal(validatePasswordForLogin("a"), "a");
    assert.equal(validatePasswordForLogin("x".repeat(200)), "x".repeat(200));
  });

  it("rejects empty string", () => {
    assert.equal(validatePasswordForLogin(""), null);
  });

  it("rejects strings longer than 200 chars", () => {
    assert.equal(validatePasswordForLogin("x".repeat(201)), null);
  });

  it("handles null gracefully", () => {
    assert.equal(validatePasswordForLogin(null), null);
  });
});

// ---------------------------------------------------------------------------
// validateRoomId
// ---------------------------------------------------------------------------
describe("validateRoomId", () => {
  it("accepts a valid room ID", () => {
    assert.equal(validateRoomId("my-room-123"), "my-room-123");
  });

  it("trims whitespace", () => {
    assert.equal(validateRoomId("  room  "), "room");
  });

  it("rejects empty string", () => {
    assert.equal(validateRoomId(""), null);
  });

  it("rejects whitespace-only", () => {
    assert.equal(validateRoomId("   "), null);
  });

  it("rejects room IDs longer than 200 chars", () => {
    assert.equal(validateRoomId("r".repeat(201)), null);
  });

  it("accepts exactly 200 chars", () => {
    const id = "r".repeat(200);
    assert.equal(validateRoomId(id), id);
  });

  it("handles null gracefully", () => {
    assert.equal(validateRoomId(null), null);
  });
});
