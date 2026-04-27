const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeForMatch,
  levenshtein,
  isCorrectGuess,
  isNearMiss,
} = require("../gameMatch");

test("normalizeForMatch lowercases, strips accents, drops articles + punctuation", () => {
  assert.equal(normalizeForMatch("Café"), "cafe");
  assert.equal(normalizeForMatch("THE Matrix"), "matrix");
  assert.equal(normalizeForMatch("an apple"), "apple");
  assert.equal(normalizeForMatch("A Bug's Life!"), "bugs life");
  assert.equal(normalizeForMatch("  Multiple   spaces  "), "multiple spaces");
  assert.equal(normalizeForMatch(null), "");
  assert.equal(normalizeForMatch(""), "");
});

test("levenshtein returns correct distance", () => {
  assert.equal(levenshtein("", ""), 0);
  assert.equal(levenshtein("a", ""), 1);
  assert.equal(levenshtein("", "abc"), 3);
  assert.equal(levenshtein("kitten", "sitting"), 3);
  assert.equal(levenshtein("apple", "aple"), 1);
  assert.equal(levenshtein("flaw", "lawn"), 2);
});

test("isCorrectGuess accepts exact match (case + spaces don't matter)", () => {
  assert.equal(isCorrectGuess("Picasso", "picasso"), true);
  assert.equal(isCorrectGuess("  PICASSO  ", "Picasso"), true);
});

test("isCorrectGuess accepts punctuation differences", () => {
  assert.equal(isCorrectGuess("picasso.", "Picasso"), true);
  assert.equal(isCorrectGuess("'Picasso'", "Picasso"), true);
  assert.equal(isCorrectGuess("WALL-E", "Wall E"), true);
});

test("isCorrectGuess accepts accent differences", () => {
  assert.equal(isCorrectGuess("cafe", "café"), true);
  assert.equal(isCorrectGuess("Pokemon", "Pokémon"), true);
});

test("isCorrectGuess accepts leading article on either side", () => {
  assert.equal(isCorrectGuess("the matrix", "Matrix"), true);
  assert.equal(isCorrectGuess("Matrix", "The Matrix"), true);
  assert.equal(isCorrectGuess("a clockwork orange", "clockwork orange"), true);
});

test("isCorrectGuess REJECTS typos (deletions, insertions, transpositions, substitutions)", () => {
  // Players must actually type the answer to score. Typos are flagged as
  // near-miss in the UI, not credited as correct.
  assert.equal(isCorrectGuess("picaso", "picasso"), false); // delete
  assert.equal(isCorrectGuess("picassso", "picasso"), false); // insert
  assert.equal(isCorrectGuess("telsa", "tesla"), false); // transposition
  assert.equal(isCorrectGuess("appel", "apple"), false); // transposition
  assert.equal(isCorrectGuess("hyuntai", "hyundai"), false); // substitution
  assert.equal(isCorrectGuess("eiffel towar", "Eiffel Tower"), false); // even on long
});

test("isCorrectGuess rejects clearly wrong guesses", () => {
  assert.equal(isCorrectGuess("banana", "apple"), false);
  assert.equal(isCorrectGuess("eiffel", "Eiffel Tower"), false); // missing word
  assert.equal(isCorrectGuess("", "apple"), false);
});

test("isNearMiss flags close-but-wrong guesses", () => {
  // The typos that USED to count as correct should now light up the
  // amber "so close" badge, so players know they were on the right track.
  assert.equal(isNearMiss("picaso", "picasso"), true);
  assert.equal(isNearMiss("picassso", "picasso"), true);
  assert.equal(isNearMiss("telsa", "tesla"), true);
  assert.equal(isNearMiss("hyuntai", "hyundai"), true);
  assert.equal(isNearMiss("eifel towr", "Eiffel Tower"), true);

  assert.equal(isNearMiss("banana", "apple"), false);
  // Exact match is not a near miss.
  assert.equal(isNearMiss("Picasso", "Picasso"), false);
  // Very short answers don't trigger near-miss.
  assert.equal(isNearMiss("ax", "ab"), false);
});
