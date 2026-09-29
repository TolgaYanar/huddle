// Exercises routes/savedRooms.js through a real Express app over HTTP, wired
// the way index.js wires it: the real createRequireAuth and session service
// in front, the real validateRoomId, and an injected fake Prisma. No database.
const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const { registerSavedRoomsRoutes } = require("../savedRooms");
const { createRequireAuth } = require("../../auth/middleware");
const {
  createSessionService,
  sha256Hex,
  SESSION_COOKIE_NAME,
} = require("../../auth/session");
const { validateRoomId } = require("../../auth/validators");

const ALICE = { id: "user-alice", username: "alice", createdAt: new Date(0) };
const BOB = { id: "user-bob", username: "bob", createdAt: new Date(0) };
const TOKENS = { "alice-token": ALICE, "bob-token": BOB };

function createFakePrisma() {
  const calls = [];
  const fake = {
    calls,
    failNext: null,
    session: {
      findFirst: async ({ where }) => {
        const entry = Object.entries(TOKENS).find(
          ([token]) => sha256Hex(token) === where.tokenHash,
        );
        return entry ? { user: entry[1] } : null;
      },
    },
    savedRoom: {},
  };
  for (const method of ["findMany", "upsert", "deleteMany"]) {
    fake.savedRoom[method] = async (args) => {
      calls.push({ method, args });
      if (fake.failNext) {
        const err = fake.failNext;
        fake.failNext = null;
        throw err;
      }
      if (method === "findMany") {
        return [{ roomId: "room-a", createdAt: "2026-01-01T00:00:00.000Z" }];
      }
      if (method === "upsert") {
        return {
          roomId: args.create.roomId,
          createdAt: "2026-01-02T00:00:00.000Z",
        };
      }
      return { count: 1 };
    };
  }
  return fake;
}

let server;
let baseUrl;
let prisma;
let prismaAvailable;
let dbConnected;
let authLookupError;
const loggedErrors = [];

before(async () => {
  const app = express();
  app.use(express.json());
  // Silence route error logging and record it instead.
  app.use((req, _res, next) => {
    req.log = { error: (...args) => loggedErrors.push(args) };
    next();
  });

  const getPrisma = () => (prismaAvailable ? prisma : null);
  const session = createSessionService({
    getPrisma,
    isDbConnected: () => dbConnected,
  });
  const getAuthUser = async (req) => {
    if (authLookupError) throw authLookupError;
    return session.getAuthUser(req);
  };
  const requireAuth = createRequireAuth({ getAuthUser });

  registerSavedRoomsRoutes(app, { getPrisma, requireAuth, validateRoomId });

  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  prisma = createFakePrisma();
  prismaAvailable = true;
  dbConnected = true;
  authLookupError = null;
  loggedErrors.length = 0;
});

async function request(method, path, { token, body, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.cookie = `${SESSION_COOKIE_NAME}=${token}`;
  if (body !== undefined) {
    h["content-type"] = "application/json";
  }
  const res = await fetch(baseUrl + path, {
    method,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body),
    // A handler that never responds would hang the suite; fail loudly instead.
    signal: AbortSignal.timeout(3000),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // non-JSON body (e.g. Express default 404 page)
  }
  return { status: res.status, body: json, text };
}

describe("saved rooms: authentication", () => {
  const routes = [
    ["GET", "/api/saved-rooms", undefined],
    ["POST", "/api/saved-rooms", { roomId: "room-a" }],
    ["DELETE", "/api/saved-rooms/room-a", undefined],
  ];

  for (const [method, path, body] of routes) {
    it(`${method} ${path} returns 401 without a session`, async () => {
      const res = await request(method, path, { body });
      assert.equal(res.status, 401);
      assert.deepEqual(res.body, { error: "unauthorized" });
      assert.equal(prisma.calls.length, 0);
    });

    it(`${method} ${path} returns 401 with an unknown session token`, async () => {
      const res = await request(method, path, { body, token: "forged" });
      assert.equal(res.status, 401);
      assert.equal(prisma.calls.length, 0);
    });

    it(`${method} ${path} returns 401 when the database is disconnected`, async () => {
      dbConnected = false;
      const res = await request(method, path, { body, token: "alice-token" });
      assert.equal(res.status, 401);
      assert.equal(prisma.calls.length, 0);
    });

    it(`${method} ${path} returns 500 auth_error when the session lookup throws`, async () => {
      authLookupError = new Error("session table down");
      const origError = console.error;
      console.error = () => {};
      try {
        const res = await request(method, path, { body, token: "alice-token" });
        assert.equal(res.status, 500);
        assert.deepEqual(res.body, { error: "auth_error" });
      } finally {
        console.error = origError;
      }
      assert.equal(prisma.calls.length, 0);
    });
  }

  it("accepts a Bearer token as well as the cookie", async () => {
    const res = await request("GET", "/api/saved-rooms", {
      headers: { authorization: "Bearer bob-token" },
    });
    assert.equal(res.status, 200);
    assert.equal(prisma.calls[0].args.where.userId, BOB.id);
  });
});

describe("GET /api/saved-rooms", () => {
  it("lists only the caller's rooms, newest first, with a narrow select", async () => {
    const res = await request("GET", "/api/saved-rooms", {
      token: "alice-token",
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      rooms: [{ roomId: "room-a", createdAt: "2026-01-01T00:00:00.000Z" }],
    });
    assert.deepEqual(prisma.calls, [
      {
        method: "findMany",
        args: {
          where: { userId: ALICE.id },
          orderBy: { createdAt: "desc" },
          select: { roomId: true, createdAt: true },
        },
      },
    ]);
  });

  it("ignores a userId in the query string", async () => {
    await request("GET", `/api/saved-rooms?userId=${BOB.id}`, {
      token: "alice-token",
    });
    assert.equal(prisma.calls[0].args.where.userId, ALICE.id);
  });

  it("returns 500 server_error when the query throws, and logs it", async () => {
    prisma.failNext = new Error("boom");
    const res = await request("GET", "/api/saved-rooms", {
      token: "alice-token",
    });
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { error: "server_error" });
    assert.equal(loggedErrors.length, 1);
    assert.match(loggedErrors[0][0], /saved-rooms failed/);
  });
});

describe("POST /api/saved-rooms", () => {
  it("upserts on the (userId, roomId) key for the caller", async () => {
    const res = await request("POST", "/api/saved-rooms", {
      token: "alice-token",
      body: { roomId: "  My_Room-1  " },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      room: { roomId: "My_Room-1", createdAt: "2026-01-02T00:00:00.000Z" },
    });
    assert.deepEqual(prisma.calls[0], {
      method: "upsert",
      args: {
        where: { userId_roomId: { userId: ALICE.id, roomId: "My_Room-1" } },
        update: {},
        create: { userId: ALICE.id, roomId: "My_Room-1" },
        select: { roomId: true, createdAt: true },
      },
    });
  });

  it("ignores a userId in the body (cannot save into another account)", async () => {
    await request("POST", "/api/saved-rooms", {
      token: "alice-token",
      body: { roomId: "room-a", userId: BOB.id },
    });
    const { args } = prisma.calls[0];
    assert.equal(args.create.userId, ALICE.id);
    assert.equal(args.where.userId_roomId.userId, ALICE.id);
  });

  const invalid = [
    ["missing roomId", {}],
    ["empty roomId", { roomId: "" }],
    ["whitespace roomId", { roomId: "   " }],
    ["too long roomId", { roomId: "r".repeat(201) }],
    ["path separator", { roomId: "a/b" }],
    ["traversal", { roomId: "../x" }],
    ["object roomId", { roomId: { $ne: null } }],
    ["null roomId", { roomId: null }],
    ["false roomId", { roomId: false }],
  ];
  for (const [label, body] of invalid) {
    it(`rejects ${label} with 400 invalid_roomId`, async () => {
      const res = await request("POST", "/api/saved-rooms", {
        token: "alice-token",
        body,
      });
      assert.equal(res.status, 400);
      assert.deepEqual(res.body, { error: "invalid_roomId" });
      assert.equal(prisma.calls.length, 0);
    });
  }

  it("rejects a request with no JSON body with 400", async () => {
    const res = await request("POST", "/api/saved-rooms", {
      token: "alice-token",
    });
    assert.equal(res.status, 400);
    assert.equal(prisma.calls.length, 0);
  });

  it("accepts exactly 200 characters", async () => {
    const res = await request("POST", "/api/saved-rooms", {
      token: "alice-token",
      body: { roomId: "r".repeat(200) },
    });
    assert.equal(res.status, 200);
  });

  it("coerces a numeric roomId to its string form", async () => {
    const res = await request("POST", "/api/saved-rooms", {
      token: "alice-token",
      body: { roomId: 42 },
    });
    assert.equal(res.status, 200);
    assert.equal(prisma.calls[0].args.create.roomId, "42");
  });

  it("returns 500 server_error when the upsert throws", async () => {
    prisma.failNext = Object.assign(new Error("unique"), { code: "P2002" });
    const res = await request("POST", "/api/saved-rooms", {
      token: "alice-token",
      body: { roomId: "room-a" },
    });
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { error: "server_error" });
    assert.equal(loggedErrors.length, 1);
  });
});

describe("DELETE /api/saved-rooms/:roomId", () => {
  it("deletes scoped to the caller, so another user's row cannot be removed", async () => {
    const res = await request("DELETE", "/api/saved-rooms/room-a", {
      token: "bob-token",
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
    assert.deepEqual(prisma.calls, [
      {
        method: "deleteMany",
        args: { where: { userId: BOB.id, roomId: "room-a" } },
      },
    ]);
  });

  it("is idempotent: ok even when nothing matched", async () => {
    prisma.savedRoom.deleteMany = async () => ({ count: 0 });
    const res = await request("DELETE", "/api/saved-rooms/nope", {
      token: "alice-token",
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
  });

  it("validates the decoded path parameter", async () => {
    // %2F decodes to "/" and %20 to " ": both outside the room-id charset.
    for (const encoded of ["a%2Fb", "a%20b", "caf%C3%A9", "..%2F..%2Fx"]) {
      const res = await request("DELETE", `/api/saved-rooms/${encoded}`, {
        token: "alice-token",
      });
      assert.equal(res.status, 400, encoded);
      assert.deepEqual(res.body, { error: "invalid_roomId" });
    }
    assert.equal(prisma.calls.length, 0);
  });

  it("rejects a 201-character room id", async () => {
    const res = await request("DELETE", `/api/saved-rooms/${"r".repeat(201)}`, {
      token: "alice-token",
    });
    assert.equal(res.status, 400);
  });

  it("returns 500 server_error when deleteMany throws", async () => {
    prisma.failNext = new Error("boom");
    const res = await request("DELETE", "/api/saved-rooms/room-a", {
      token: "alice-token",
    });
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { error: "server_error" });
  });
});

describe("saved rooms: authenticated but Prisma client unavailable", () => {
  // getPrisma() returning null after auth succeeded (e.g. the client was torn
  // down) must degrade to a 500, not an unhandled rejection that hangs.
  it("GET, POST and DELETE each answer 500 instead of hanging", async () => {
    const authedPrisma = prisma;
    // Keep auth working through a separate path: authenticate first via a
    // getAuthUser that still sees the client, then drop it for the handler.
    authedPrisma.session.findFirst = async () => {
      prismaAvailable = false;
      return { user: ALICE };
    };
    const cases = [
      ["GET", "/api/saved-rooms", undefined],
      ["POST", "/api/saved-rooms", { roomId: "room-a" }],
      ["DELETE", "/api/saved-rooms/room-a", undefined],
    ];
    for (const [method, path, body] of cases) {
      prismaAvailable = true;
      const res = await request(method, path, { token: "alice-token", body });
      assert.equal(res.status, 500, `${method} ${path}`);
      assert.deepEqual(res.body, { error: "server_error" });
    }
  });
});

describe("saved rooms: logging fallback", () => {
  it("falls back to console.error when req.log is absent", async () => {
    const app = express();
    app.use(express.json());
    registerSavedRoomsRoutes(app, {
      getPrisma: () => ({
        savedRoom: {
          findMany: async () => {
            throw new Error("boom");
          },
        },
      }),
      requireAuth: (req, _res, next) => {
        req.authUser = ALICE;
        next();
      },
      validateRoomId,
    });
    const srv = await new Promise((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const logged = [];
    const origError = console.error;
    console.error = (...args) => logged.push(args);
    try {
      const res = await fetch(
        `http://127.0.0.1:${srv.address().port}/api/saved-rooms`,
        { signal: AbortSignal.timeout(3000) },
      );
      assert.equal(res.status, 500);
    } finally {
      console.error = origError;
      await new Promise((resolve) => srv.close(resolve));
    }
    assert.equal(logged.length, 1);
    assert.match(logged[0][0], /saved-rooms failed/);
  });
});
