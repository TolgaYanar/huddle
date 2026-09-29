// Edge cases for auth/validators.js not covered by validators.test.js:
// non-string input (numbers, arrays, objects, booleans), exact length
// boundaries after trimming, and charset edges. Every validator coerces with
// String(raw || ""), so these pin down what that coercion lets through.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  validateUsername,
  validatePassword,
  validatePasswordForLogin,
  validateRoomId,
} = require("../validators");

describe("validateUsername: non-string input", () => {
  it("treats falsy values as empty and rejects them", () => {
    for (const v of [0, false, "", null, undefined, NaN]) {
      assert.equal(validateUsername(v), null, `input ${String(v)}`);
    }
  });

  it("coerces numbers to their decimal string", () => {
    assert.equal(validateUsername(12345), "12345");
    assert.equal(validateUsername(12), null); // "12" is too short
  });

  it("rejects plain objects ('[object object]' has a space and brackets)", () => {
    assert.equal(validateUsername({}), null);
    assert.equal(validateUsername({ username: "alice" }), null);
  });

  it("coerces a single-element array to its element", () => {
    // String(["alice"]) === "alice". Documented, not endorsed: a JSON body of
    // {"username": ["alice"]} validates as "alice".
    assert.equal(validateUsername(["alice"]), "alice");
  });

  it("rejects multi-element arrays (comma is outside the charset)", () => {
    assert.equal(validateUsername(["ali", "ce"]), null);
  });

  it("uses an object's toString when it yields a valid name", () => {
    assert.equal(validateUsername({ toString: () => "Carol" }), "carol");
  });
});

describe("validateUsername: length and charset edges", () => {
  it("measures length after trimming", () => {
    assert.equal(validateUsername("  ab  "), null);
    assert.equal(validateUsername(`  ${"a".repeat(20)}  `), "a".repeat(20));
    assert.equal(validateUsername(`\t${"a".repeat(21)}\n`), null);
  });

  it("accepts an all-digit or all-underscore name", () => {
    assert.equal(validateUsername("123"), "123");
    assert.equal(validateUsername("___"), "___");
  });

  it("rejects hyphen, dot, @ and other punctuation", () => {
    for (const v of ["ab-c", "ab.c", "a@bc", "abc$", "ab/c", "ab'c"]) {
      assert.equal(validateUsername(v), null, v);
    }
  });

  it("rejects non-ASCII letters", () => {
    assert.equal(validateUsername("jösé"), null);
    assert.equal(validateUsername("ユーザー名"), null);
    assert.equal(validateUsername("abc​"), null); // zero-width space
  });

  it("rejects an internal newline or tab", () => {
    assert.equal(validateUsername("ab\ncd"), null);
    assert.equal(validateUsername("ab\tcd"), null);
  });

  it("folds the Kelvin sign to ASCII k via toLowerCase", () => {
    // U+212A lowercases to "k", so it normalises to the same stored name as
    // the ASCII spelling rather than creating a look-alike account.
    assert.equal(validateUsername("Kelvin"), "kelvin");
  });
});

describe("validatePassword: edges", () => {
  it("accepts exactly 200 characters and rejects 201", () => {
    const base = "Aa1";
    const p200 = base + "x".repeat(197);
    assert.equal(p200.length, 200);
    assert.equal(validatePassword(p200), p200);
    assert.equal(validatePassword(p200 + "x"), null);
  });

  it("rejects 7 characters that satisfy every class", () => {
    assert.equal(validatePassword("Abcde1x"), null);
  });

  it("does not trim: surrounding whitespace counts toward length and is kept", () => {
    assert.equal(validatePassword(" Abcde1 "), " Abcde1 ");
    assert.equal(validatePassword("  Abc1  ").length, 8);
  });

  it("does not count non-ASCII letters or digits toward the class rules", () => {
    // "ÄÖÜ" are not [A-Z]; "١" (Arabic-Indic one) is not \d.
    assert.equal(validatePassword("äöüabc12"), null); // no uppercase
    assert.equal(validatePassword("ÄÖÜABCab"), null); // no digit
    assert.equal(validatePassword("Abcdefg١"), null); // non-ASCII digit
  });

  it("rejects non-string input that coerces to a weak password", () => {
    assert.equal(validatePassword(12345678), null);
    assert.equal(validatePassword({}), null); // "[object Object]" lacks a digit
    assert.equal(validatePassword(0), null);
    assert.equal(validatePassword(false), null);
  });
});

describe("validatePasswordForLogin: edges", () => {
  it("accepts a whitespace-only password (no trimming)", () => {
    assert.equal(validatePasswordForLogin(" "), " ");
  });

  it("coerces numbers, but treats 0 as empty", () => {
    assert.equal(validatePasswordForLogin(1234), "1234");
    assert.equal(validatePasswordForLogin(0), null);
  });

  it("counts UTF-16 code units, so 100 emoji is at the limit", () => {
    const hundred = "😀".repeat(100);
    assert.equal(hundred.length, 200);
    assert.equal(validatePasswordForLogin(hundred), hundred);
    assert.equal(validatePasswordForLogin(hundred + "a"), null);
  });
});

describe("validateRoomId: non-string input", () => {
  it("coerces numbers", () => {
    assert.equal(validateRoomId(42), "42");
    assert.equal(validateRoomId(0), null); // falsy -> empty
  });

  it("rejects objects and multi-element arrays", () => {
    assert.equal(validateRoomId({}), null);
    assert.equal(validateRoomId(["a", "b"]), null);
  });

  it("coerces a single-element array to its element", () => {
    assert.equal(validateRoomId(["room-1"]), "room-1");
  });

  it("rejects a length of 201 even when it would trim to 200", () => {
    assert.equal(validateRoomId(` ${"r".repeat(200)}`), "r".repeat(200));
    assert.equal(validateRoomId("r".repeat(201)), null);
  });

  it("rejects URL-significant characters", () => {
    for (const v of ["a?b", "a#b", "a%20b", "a.b", "a&b", "a=b", "a+b"]) {
      assert.equal(validateRoomId(v), null, v);
    }
  });

  it("accepts a single character", () => {
    assert.equal(validateRoomId("a"), "a");
    assert.equal(validateRoomId("-"), "-");
    assert.equal(validateRoomId("_"), "_");
  });
});
