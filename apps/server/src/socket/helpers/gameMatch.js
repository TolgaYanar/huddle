/**
 * Forgiving answer matching for the Guess It! game.
 *
 * Players type fast and the canonical answer is rarely exactly what they'd
 * type (capitalisation, punctuation, articles, accents, fat-fingered typos).
 * Strict string equality marks too many real correct guesses as wrong, which
 * is the #1 frustration. This helper returns true when a guess matches the
 * answer in a way a human would consider correct.
 *
 * Rules (applied to both sides):
 *   - lowercase
 *   - strip diacritics (café → cafe)
 *   - remove leading "the ", "a ", "an "
 *   - remove non-alphanumeric (drop punctuation; keep spaces)
 *   - collapse runs of whitespace
 *
 * After normalisation:
 *   - exact match → correct
 *   - Levenshtein ≤ 1 for ≥6-char answers → correct (one fat-fingered typo)
 *   - Levenshtein ≤ 2 for ≥12-char answers → correct (two typos)
 *
 * `nearMiss(g, a)` returns true for wrong guesses that came close: lets the
 * UI render a "so close!" badge. Tighter than the match thresholds so we
 * don't spam the badge for every random word.
 */

function normalizeForMatch(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/^(the|a|an)\s+/u, "") // drop leading article
    .replace(/[^a-z0-9 ]+/g, "") // drop punctuation, keep alnum + space
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;

  // Rolling-row DP — O(min(a,b)) memory.
  let prev = new Array(bl + 1);
  let curr = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    for (let j = 1; j <= bl; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[bl];
}

function isCorrectGuess(guess, answer) {
  const g = normalizeForMatch(guess);
  const a = normalizeForMatch(answer);
  if (!g || !a) return false;
  if (g === a) return true;
  if (a.length >= 6 && levenshtein(g, a) <= 1) return true;
  if (a.length >= 12 && levenshtein(g, a) <= 2) return true;
  return false;
}

function isNearMiss(guess, answer) {
  const g = normalizeForMatch(guess);
  const a = normalizeForMatch(answer);
  if (!g || !a) return false;
  if (g === a) return false;
  if (a.length < 4) return false;
  const dist = levenshtein(g, a);
  // Bands chosen so 'apple' vs 'aple' is "close", but 'apple' vs 'banana' is not.
  if (a.length < 8) return dist <= 2;
  if (a.length < 16) return dist <= 3;
  return dist <= 4;
}

module.exports = {
  normalizeForMatch,
  levenshtein,
  isCorrectGuess,
  isNearMiss,
};
