const test = require("node:test");
const assert = require("node:assert/strict");

// This file is the one server test that needs a generated Prisma client, so
// the server `test` task depends on its `build` (prisma generate). Everything
// else stays client-free -- handlers take prisma by injection.
const { initPrisma } = require("../prisma");

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
