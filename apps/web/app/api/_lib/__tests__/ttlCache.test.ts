import { describe, expect, it } from "vitest";

import { createTtlCache } from "../ttlCache";

describe("createTtlCache", () => {
  it("returns stored values until they expire", () => {
    let t = 0;
    const cache = createTtlCache<string>({ max: 10, ttlMs: 100, now: () => t });
    cache.set("a", "A");
    t = 99;
    expect(cache.get("a")).toBe("A");
    t = 100;
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("evicts the least recently used entry past max", () => {
    const cache = createTtlCache<number>({ max: 2, ttlMs: 1000 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a"); // a is now most recent
    cache.set("c", 3);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    expect(cache.get("c")).toBe(3);
  });
});
