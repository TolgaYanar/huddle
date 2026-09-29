import { describe, expect, it } from "vitest";

import { safeNextPath } from "../safeRedirect";

describe("safeNextPath", () => {
  it("keeps same-origin paths", () => {
    expect(safeNextPath("/")).toBe("/");
    expect(safeNextPath("/r/abc123")).toBe("/r/abc123");
    expect(safeNextPath("/r/abc?x=1#y")).toBe("/r/abc?x=1#y");
  });

  it("falls back to / for missing values", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath("")).toBe("/");
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(safeNextPath("https://evil.example/login")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("javascript:alert(1)")).toBe("/");
    expect(safeNextPath("r/abc")).toBe("/");
  });

  it("rejects forms browsers normalise into protocol-relative URLs", () => {
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath("/\t/evil.example")).toBe("/");
    expect(safeNextPath("/\n/evil.example")).toBe("/");
  });
});
