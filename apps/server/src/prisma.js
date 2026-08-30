const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const DATABASE_CONNECTION_TIMEOUT_MS = 5_000;

function getPrismaPgConfig(databaseUrl) {
  let schema;
  if (typeof databaseUrl === "string" && databaseUrl) {
    try {
      schema = new URL(databaseUrl).searchParams.get("schema") || undefined;
    } catch {
      // Let pg/Prisma report the malformed connection string during the probe.
    }
  }

  return {
    poolConfig: {
      connectionString: databaseUrl,
      // pg defaults to no timeout. Bound startup probes so an unreachable
      // network cannot leave a connection attempt pending indefinitely.
      connectionTimeoutMillis: DATABASE_CONNECTION_TIMEOUT_MS,
    },
    // Prisma 6 read `?schema=` from the datasource URL. Driver adapters need
    // the schema explicitly or non-public-schema deployments silently query
    // `public` after upgrading.
    adapterOptions: schema ? { schema } : undefined,
  };
}

function initPrisma({ vLog }) {
  const state = {
    prisma: null,
    dbConnected: false,
    // Resolves once the startup probe settles. The pg pool is lazy, so the
    // probe finishes after server.listen() fires; without this the startup
    // banner reported "memory-only mode" on a perfectly healthy database.
    ready: Promise.resolve(false),
  };

  try {
    // Prisma 7 no longer reads the connection URL from schema.prisma and
    // requires an explicit driver adapter for a direct database connection.
    // The URL lives in the environment (and in prisma.config.js for the
    // CLI), so both paths still read exactly DATABASE_URL.
    const { poolConfig, adapterOptions } = getPrismaPgConfig(
      process.env.DATABASE_URL,
    );
    const adapter = new PrismaPg(poolConfig, adapterOptions);

    state.prisma = new PrismaClient({
      adapter,
      errorFormat: "pretty",
    });

    // Probe with a real round-trip, not $connect().
    //
    // Under Prisma 6 the Rust engine dialled eagerly, so $connect() rejected
    // when the database was unreachable. With a driver adapter the pg pool is
    // lazy: $connect() resolves even against a dead host, which left
    // dbConnected permanently true. That silently killed the memory-only
    // degradation path — /health always reported "connected" and auth issued
    // queries that threw at call time instead of falling back.
    state.ready = state.prisma.$queryRaw`SELECT 1`
      .then(() => {
        state.dbConnected = true;
        if (typeof vLog === "function")
          vLog("✓ Database connected successfully");
        return true;
      })
      .catch((err) => {
        console.warn("⚠ Database connection failed:", err.message);
        state.dbConnected = false;
        return false;
      });
  } catch (err) {
    console.error("✗ Failed to initialize Prisma:", err.message);
    state.dbConnected = false;
  }

  return state;
}

module.exports = {
  DATABASE_CONNECTION_TIMEOUT_MS,
  getPrismaPgConfig,
  initPrisma,
};
