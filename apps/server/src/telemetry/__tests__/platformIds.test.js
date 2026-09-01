const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { PLATFORMS } = require("../syncMetric");

// The extension sends its adapter id verbatim as the telemetry `platform`
// field. parseSyncMetric coerces any token this server does not know to
// "other" instead of rejecting it, which is right for forward compatibility
// but means a mismatch is completely silent: a platform's sync quality would
// merge into the "other" bucket, and the blind spot the telemetry exists to
// remove would reopen without a single failure anywhere.
//
// The extension's union is read as text rather than imported. It is TypeScript
// in another workspace, and a literal copy of the list here would only be a
// second place to forget.
const TYPES_PATH = path.join(
  __dirname,
  "../../../../extension-netflix-party/src/content/platforms/types.ts",
);

function extensionPlatformIds() {
  const source = fs.readFileSync(TYPES_PATH, "utf8");
  const union = source.match(/export type PlatformId =([^;]+);/);
  assert.ok(union, `Could not find the PlatformId union in ${TYPES_PATH}`);
  return [...union[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

test("every extension platform id is a platform this server records", () => {
  const ids = extensionPlatformIds();

  // Guard the guard: an empty list would pass vacuously.
  assert.ok(ids.length > 0, "parsed no platform ids");

  const unrecorded = ids.filter((id) => !PLATFORMS.has(id));
  assert.deepEqual(
    unrecorded,
    [],
    `These adapter ids are missing from PLATFORMS, so their telemetry would ` +
      `be recorded as "other": ${unrecorded.join(", ")}`,
  );
});
