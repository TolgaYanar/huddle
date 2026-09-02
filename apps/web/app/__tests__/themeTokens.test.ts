import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A Tailwind class naming a colour that does not exist is silently inert: the
 * element simply inherits its parent, so the page still renders and nothing
 * fails. That is exactly how `text-ink0` reached production on 117 elements —
 * an ordered find-and-replace cut `text-slate-500` short, and the muted text
 * hierarchy quietly disappeared. Only a check like this makes it loud.
 */
const APP = join(__dirname, "..");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (
      entry === "node_modules" ||
      entry === ".next" ||
      entry === "__tests__"
    ) {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

function declaredTokens(): Set<string> {
  const css = readFileSync(join(APP, "globals.css"), "utf8");
  const block = css.match(/@theme inline \{([\s\S]*?)\n\}/);
  if (!block) throw new Error("Could not find the @theme inline block");
  return new Set(
    [...block[1]!.matchAll(/--color-([a-z0-9-]+):/g)].map((m) => m[1]!),
  );
}

// Utilities that take a colour token. Anything else (spacing, radius) is out.
const USES_COLOR =
  /(?:^|\s|"|'|`|\{)(?:hover:|focus:|focus-visible:|active:|disabled:|group-hover:|dark:|placeholder:|sm:|md:|lg:)*(?:text|bg|border|ring|fill|stroke|from|to|via|divide|outline|decoration|shadow|accent|caret)-([a-z][a-z0-9-]*)/g;

describe("theme tokens", () => {
  it("every theme-coloured class in the app resolves to a declared token", () => {
    const declared = declaredTokens();
    expect(declared.size).toBeGreaterThan(8);

    // Only judge classes that clearly mean to use this palette. Tailwind's own
    // scale (slate-500, white, transparent, ...) is not this test's business.
    const families = [...declared].sort((a, b) => b.length - a.length);
    const offenders: string[] = [];

    for (const file of sourceFiles(APP)) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(USES_COLOR)) {
        const token = match[1]!;
        const owned = families.find(
          (f) =>
            token === f || token.startsWith(`${f}-`) || token.startsWith(f),
        );
        if (!owned) continue;
        if (declared.has(token)) continue;
        // Opacity modifiers (`text-ink/70`) are stripped by the regex already.
        offenders.push(`${file.replace(APP, "app")}: ${match[0].trim()}`);
      }
    }

    expect(
      [...new Set(offenders)],
      "These classes look like theme tokens but are not declared in @theme inline, " +
        "so they render as no colour at all",
    ).toEqual([]);
  });
});

/**
 * A custom class is not a Tailwind utility, so `panel/95` is not "panel at 95%"
 * — it is a class nobody defined. The element then loses its background, border
 * and radius entirely, which is how a game modal shipped with black-on-black
 * text in light mode. Nothing failed; the class simply did not exist.
 *
 * This reads the component class names out of the stylesheet rather than
 * hard-coding them, so a new one is covered the day it is written.
 */
function componentClasses(): string[] {
  const css = readFileSync(join(APP, "globals.css"), "utf8");
  const layer = css.match(/@layer components \{([\s\S]*)/);
  if (!layer) throw new Error("Could not find the components layer");
  return [
    ...new Set(
      [...layer[1]!.matchAll(/^\s{2,4}\.([a-z][a-z0-9\\:-]*)/gm)].map((m) =>
        m[1]!.replace(/\\/g, ""),
      ),
    ),
  ];
}

describe("component classes", () => {
  it("are never used with an opacity modifier", () => {
    const names = componentClasses();
    expect(names.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of sourceFiles(APP)) {
      const source = readFileSync(file, "utf8");
      for (const name of names) {
        const bare = name.replace(/^lg:/, "");
        const pattern = new RegExp(`\\b(?:lg:)?${bare}\\/[0-9]`, "g");
        for (const hit of source.matchAll(pattern)) {
          offenders.push(`${file.replace(APP, "app")}: ${hit[0]}`);
        }
      }
    }

    expect(
      offenders,
      "A custom class with an opacity modifier is not a class at all, so the " +
        "element loses everything the class was providing",
    ).toEqual([]);
  });
});
