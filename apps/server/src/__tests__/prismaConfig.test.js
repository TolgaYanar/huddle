const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DATABASE_CONNECTION_TIMEOUT_MS,
  getPrismaPgConfig,
  initPrisma,
} = require("../prisma");

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

test("initPrisma exposes a probe promise that resolves false without a database", async () => {
  // The pg pool is lazy, so the probe settles after server.listen() fires.
  // index.js waits on this promise before printing the database status;
  // reading state.dbConnected synchronously reported "memory-only mode" even
  // against a healthy database.
  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgresql://u:p@127.0.0.1:59998/nodb";
  const warn = console.warn;
  console.warn = () => {};
  try {
    const state = initPrisma({ vLog: undefined });
    assert.equal(typeof state.ready?.then, "function");
    assert.equal(await state.ready, false);
    assert.equal(state.dbConnected, false);
    await state.prisma?.$disconnect().catch(() => {});
  } finally {
    console.warn = warn;
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
  }
});
