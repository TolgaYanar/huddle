const { PrismaClient } = require("@prisma/client");

function initPrisma({ vLog }) {
  const state = {
    prisma: null,
    dbConnected: false,
  };

  try {
    state.prisma = new PrismaClient({
      errorFormat: "pretty",
    });

    // Test connection
    state.prisma
      .$connect()
      .then(() => {
        state.dbConnected = true;
        if (typeof vLog === "function")
          vLog("✓ Database connected successfully");
      })
      .catch((err) => {
        console.warn("⚠ Database connection failed:", err.message);
        state.dbConnected = false;
      });
  } catch (err) {
    console.error("✗ Failed to initialize Prisma:", err.message);
    state.dbConnected = false;
  }

  return state;
}

module.exports = {
  initPrisma,
};
