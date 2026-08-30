const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { registerAuthRoutes } = require("../../routes/auth");

function createApp() {
  const routes = new Map();
  return {
    routes,
    get(path, ...handlers) {
      routes.set(`GET ${path}`, handlers.at(-1));
    },
    post(path, ...handlers) {
      routes.set(`POST ${path}`, handlers.at(-1));
    },
  };
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function createDeps(prisma, overrides = {}) {
  return {
    isDbConnected: () => true,
    getPrisma: () => prisma,
    getAuthUser: async () => null,
    createSessionForUser: async () => ({
      token: "token",
      expiresAt: new Date("2030-01-01T00:00:00Z"),
    }),
    setSessionCookie() {},
    clearSessionCookie() {},
    validateUsername: (value) => value,
    validatePassword: (value) => value,
    validatePasswordForLogin: (value) => value,
    hashPassword: async () => "resolved-hash",
    verifyPassword: async () => true,
    SESSION_COOKIE_NAME: "session",
    parseCookies: () => ({}),
    sha256Hex: (value) => value,
    ...overrides,
  };
}

describe("auth routes await password work", () => {
  it("stores the resolved hash rather than a Promise during registration", async () => {
    let createData;
    const prisma = {
      user: {
        create: async ({ data }) => {
          createData = data;
          return { id: "u1", username: data.username, createdAt: new Date() };
        },
      },
    };
    const app = createApp();
    registerAuthRoutes(app, createDeps(prisma));
    const response = createResponse();

    await app.routes.get("POST /api/auth/register")(
      { body: { username: "alice", password: "Password7" } },
      response,
    );

    assert.equal(createData.passwordHash, "resolved-hash");
    assert.equal(response.statusCode, 200);
  });

  it("awaits an async false verification result during login", async () => {
    let sessionsCreated = 0;
    const prisma = {
      user: {
        findUnique: async () => ({
          id: "u1",
          username: "alice",
          passwordHash: "stored",
          createdAt: new Date(),
        }),
      },
    };
    const app = createApp();
    registerAuthRoutes(
      app,
      createDeps(prisma, {
        verifyPassword: async () => false,
        createSessionForUser: async () => {
          sessionsCreated += 1;
          return { token: "token", expiresAt: new Date() };
        },
      }),
    );
    const response = createResponse();

    await app.routes.get("POST /api/auth/login")(
      { body: { username: "alice", password: "WrongPassword7" } },
      response,
    );

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, { error: "invalid_credentials" });
    assert.equal(sessionsCreated, 0);
  });

  it("runs dummy verification when the username does not exist", async () => {
    let verifiedHash = null;
    const prisma = {
      user: { findUnique: async () => null },
    };
    const app = createApp();
    registerAuthRoutes(
      app,
      createDeps(prisma, {
        verifyPassword: async (_password, storedHash) => {
          verifiedHash = storedHash;
          return false;
        },
      }),
    );
    const response = createResponse();

    await app.routes.get("POST /api/auth/login")(
      { body: { username: "missing", password: "Password7" } },
      response,
    );

    assert.match(verifiedHash, /^[a-f\d]{32}:[a-f\d]{128}$/);
    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, { error: "invalid_credentials" });
  });
});
