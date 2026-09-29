import { afterEach, describe, expect, it, vi } from "vitest";

import { syncDebug } from "../syncDebug";

describe("syncDebug", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("is silent by default", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    syncDebug("[SEEK] test");
    expect(log).not.toHaveBeenCalled();
  });

  it("logs when huddle:debugSync is enabled", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    window.localStorage.setItem("huddle:debugSync", "1");
    syncDebug("[SEEK] test", 1);
    expect(log).toHaveBeenCalledWith("[SEEK] test", 1);
  });
});
