/**
 * Returns `raw` only when it is a same-origin path, otherwise "/".
 *
 * `?next=` on /login and /register is attacker-controlled, and `router.push`
 * follows absolute and protocol-relative URLs, so an unchecked value turns a
 * real sign-in into a redirect to a lookalike site. Browsers also read "\" as
 * "/" and drop tabs/newlines while parsing, which makes "/\evil.example" and
 * "/\t/evil.example" protocol-relative too — hence the character checks.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (typeof raw !== "string" || raw.length === 0) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f || code === 0x5c /* \ */) return "/";
  }
  return raw;
}
