/**
 * Answer matching for the Guess It! game.
 *
 * Design rule: forgive *presentation* differences, but require the player
 * to actually type the answer. Typos do NOT count as correct — they
 * surface as a "so close" near-miss instead, which lets the guesser see
 * they were on the right track and (if it's still their turn) try again.
 *
 * Normalisation (applied to both sides) — this is what we *do* forgive:
 *   - lowercase
 *   - strip diacritics (café → cafe)
 *   - remove leading "the ", "a ", "an "
 *   - remove non-alphanumeric (drop punctuation; keep spaces)
 *   - collapse runs of whitespace
 *
 * A guess counts as correct iff the normalised guess equals the
 * normalised answer. Anything else — including single-letter typos,
 * deletions, insertions, transpositions — is wrong. The accepting of
 * those was a UX gift but had a worse failure mode (`hyundai` ≈ `hyuntai`
 * read as correct), so we removed it.
 *
 * `isNearMiss` returns true for *wrong* guesses that came visually close,
 * so the UI can render an encouraging amber pill alongside red rejected
 * guesses. Tightness scales with answer length.
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
  // Fallback: also try the "compact" form (whitespace removed) so that
  // hyphen/space presentation differences match — `WALL-E` vs `Wall E`
  // both compact to `walle`. Internal spelling still has to match.
  return g.replace(/\s+/g, "") === a.replace(/\s+/g, "");
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
