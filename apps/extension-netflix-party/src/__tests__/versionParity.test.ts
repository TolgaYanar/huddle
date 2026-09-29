import { describe, expect, it } from "vitest";

import pkg from "../../package.json";
import manifest from "../../public/manifest.json";

describe("extension version", () => {
  // The manifest version is the public release label (and the telemetry
  // label); package.json must match it so a bump can't land in only one.
  it("is the same in manifest.json and package.json", () => {
    expect(manifest.version).toBe(pkg.version);
  });
});
