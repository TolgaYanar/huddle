import { describe, expect, it } from "vitest";

import { toSafeExternalHref } from "../video";

describe("toSafeExternalHref", () => {
  it("keeps http(s) URLs", () => {
    expect(toSafeExternalHref("https://www.hulu.com/watch/1")).toBe(
      "https://www.hulu.com/watch/1",
    );
    expect(toSafeExternalHref("http://example.com")).toBe("http://example.com");
  });

  it("rejects other schemes and junk", () => {
    expect(toSafeExternalHref("javascript:alert(1)//hulu.com")).toBeNull();
    expect(toSafeExternalHref("JAVASCRIPT:alert(1)")).toBeNull();
    expect(toSafeExternalHref("data:text/html,<b>x</b>")).toBeNull();
    expect(toSafeExternalHref("intent://x#Intent;end")).toBeNull();
    expect(toSafeExternalHref("not a url")).toBeNull();
    expect(toSafeExternalHref("")).toBeNull();
    expect(toSafeExternalHref(null)).toBeNull();
  });
});
