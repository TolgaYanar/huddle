const test = require("node:test");
const assert = require("node:assert/strict");

// Import the pure module, not ../prisma: the latter loads @prisma/client and
// would fail before `prisma generate` has run.
const {
  DATABASE_CONNECTION_TIMEOUT_MS,
  getPrismaPgConfig,
} = require("../prismaConfig");

test("Prisma pg config bounds connection attempts", () => {
  const databaseUrl = "postgresql://user:pass@localhost:5432/huddle";
  const config = getPrismaPgConfig(databaseUrl);

  assert.equal(config.poolConfig.connectionString, databaseUrl);
  assert.equal(
    config.poolConfig.connectionTimeoutMillis,
    DATABASE_CONNECTION_TIMEOUT_MS,
  );
  assert.equal(config.adapterOptions, undefined);
});

test("Prisma pg config preserves a datasource schema from DATABASE_URL", () => {
  const config = getPrismaPgConfig(
    "postgresql://user:pass@localhost:5432/huddle?schema=tenant_one",
  );

  assert.deepEqual(config.adapterOptions, { schema: "tenant_one" });
});

test("Prisma pg config safely leaves malformed URLs for the connection probe", () => {
  const config = getPrismaPgConfig("not a postgres url");

  assert.equal(config.poolConfig.connectionString, "not a postgres url");
  assert.equal(config.adapterOptions, undefined);
});
