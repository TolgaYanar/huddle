// Pure connection-configuration helpers.
//
// Deliberately free of `@prisma/client`: server tests must keep running
// without a generated client (see CLAUDE.md). Importing src/prisma.js from a
// test pulls in the client and fails on a fresh checkout where `prisma
// generate` has not run yet — which is exactly how CI starts.

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

module.exports = {
  DATABASE_CONNECTION_TIMEOUT_MS,
  getPrismaPgConfig,
};
