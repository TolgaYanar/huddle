// Tests for socket/attachAuth.js. The middleware is driven through a fake io
// whose use() captures it, with both a stub getAuthUser (to observe the exact
// request shape) and the real session service over a fake Prisma (to cover
// missing / invalid / expired / valid session cookies end to end).
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { attachSocketAuth } = require("../attachAuth");
const {
  createSessionService,
  sha256Hex,
  SESSION_COOKIE_NAME,
} = require("../../auth/session");

function createFakeIo() {
  const middlewares = [];
  return {
    middlewares,
    use(fn) {
      middlewares.push(fn);
    },
  };
}

function createState() {
  return { socketIdToUsername: new Map() };
}

function createSocket({ id = "sock-1", headers, auth } = {}) {
  return {
    id,
    handshake: { headers: headers ?? {}, auth: auth ?? {} },
    data: {},
  };
}

async function run(middleware, socket) {
  const nextArgs = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("next() not called")),
      2000,
    );
    Promise.resolve(
      middleware(socket, (...args) => {
        clearTimeout(timer);
        resolve(args);
      }),
    ).catch(reject);
  });
  return nextArgs;
}

function setup(getAuthUser) {
  const io = createFakeIo();
  const state = createState();
  attachSocketAuth(io, state, { getAuthUser });
  assert.equal(io.middlewares.length, 1);
  return { middleware: io.middlewares[0], state };
}

const ALICE = { id: "u-alice", username: "alice", createdAt: new Date(0) };

// Real session service over a fake Prisma. Sessions are keyed by token hash,
// and the fake honours the expiresAt > now filter the service sends.
function realSession(sessions, { dbConnected = true } = {}) {
  const findFirstCalls = [];
  const prisma = {
    session: {
      findFirst: async ({ where }) => {
        findFirstCalls.push(where);
        const s = sessions.find((x) => sha256Hex(x.token) === where.tokenHash);
        if (!s) return null;
        if (!(s.expiresAt > where.expiresAt.gt)) return null;
        return { user: s.user };
      },
    },
  };
  const service = createSessionService({
    getPrisma: () => prisma,
    isDbConnected: () => dbConnected,
  });
  return { getAuthUser: service.getAuthUser, findFirstCalls, prisma };
}

const future = () => new Date(Date.now() + 60_000);
const past = () => new Date(Date.now() - 60_000);

describe("attachSocketAuth: request shape passed to getAuthUser", () => {
  it("forwards a copy of the handshake headers", async () => {
    let seen;
    const { middleware } = setup(async (req) => {
      seen = req;
      return null;
    });
    const headers = { cookie: "a=b", "user-agent": "x" };
    const socket = createSocket({ headers });
    await run(middleware, socket);
    assert.deepEqual(seen, { headers: { cookie: "a=b", "user-agent": "x" } });
    assert.notEqual(seen.headers, headers, "must not pass the live object");
  });

  it("turns handshake.auth.token into a trimmed Bearer header", async () => {
    let seen;
    const { middleware } = setup(async (req) => {
      seen = req;
      return null;
    });
    const socket = createSocket({ auth: { token: "  tok-123  " } });
    await run(middleware, socket);
    assert.equal(seen.headers.authorization, "Bearer tok-123");
  });

  it("does not mutate the handshake headers when injecting the token", async () => {
    const { middleware } = setup(async () => null);
    const socket = createSocket({
      headers: { cookie: "x=1" },
      auth: { token: "tok" },
    });
    await run(middleware, socket);
    assert.deepEqual(socket.handshake.headers, { cookie: "x=1" });
  });

  it("lets auth.token override an Authorization header", async () => {
    let seen;
    const { middleware } = setup(async (req) => {
      seen = req;
      return null;
    });
    const socket = createSocket({
      headers: { authorization: "Bearer from-header" },
      auth: { token: "from-auth" },
    });
    await run(middleware, socket);
    assert.equal(seen.headers.authorization, "Bearer from-auth");
  });

  it("ignores empty, whitespace and non-string tokens", async () => {
    for (const token of ["", "   ", 123, { t: 1 }, ["tok"], null, true]) {
      let seen;
      const { middleware } = setup(async (req) => {
        seen = req;
        return null;
      });
      await run(middleware, createSocket({ auth: { token } }));
      assert.equal(
        seen.headers.authorization,
        undefined,
        `token ${JSON.stringify(token)}`,
      );
    }
  });

  it("tolerates a handshake with no headers or auth at all", async () => {
    let seen;
    const { middleware } = setup(async (req) => {
      seen = req;
      return null;
    });
    const socket = { id: "s", handshake: undefined, data: {} };
    const args = await run(middleware, socket);
    assert.deepEqual(args, []);
    assert.deepEqual(seen, { headers: {} });
  });
});

describe("attachSocketAuth: outcomes", () => {
  it("always calls next() with no error, even for anonymous sockets", async () => {
    const { middleware, state } = setup(async () => null);
    const socket = createSocket();
    const args = await run(middleware, socket);
    assert.deepEqual(args, []);
    assert.equal(socket.data.authUser, null);
    assert.equal(state.socketIdToUsername.size, 0);
  });

  it("records the user and maps socket id -> username on success", async () => {
    const { middleware, state } = setup(async () => ALICE);
    const socket = createSocket({ id: "sock-a" });
    const args = await run(middleware, socket);
    assert.deepEqual(args, []);
    assert.equal(socket.data.authUser, ALICE);
    assert.equal(state.socketIdToUsername.get("sock-a"), "alice");
  });

  it("sets authUser but no username mapping for a user without a username", async () => {
    const user = { id: "u-x", username: "" };
    const { middleware, state } = setup(async () => user);
    const socket = createSocket();
    await run(middleware, socket);
    assert.equal(socket.data.authUser, user);
    assert.equal(state.socketIdToUsername.size, 0);
  });

  it("swallows a rejected lookup and still admits the socket unauthenticated", async () => {
    const { middleware, state } = setup(async () => {
      throw new Error("db down");
    });
    const socket = createSocket();
    const args = await run(middleware, socket);
    assert.deepEqual(args, [], "no error passed to next()");
    assert.equal(socket.data.authUser, undefined);
    assert.equal(state.socketIdToUsername.size, 0);
  });

  it("swallows a synchronous throw from getAuthUser", async () => {
    const { middleware } = setup(() => {
      throw new Error("sync");
    });
    const args = await run(middleware, createSocket());
    assert.deepEqual(args, []);
  });
});

describe("attachSocketAuth with the real session service", () => {
  const cookie = (token) => `other=1; ${SESSION_COOKIE_NAME}=${token}`;

  it("missing cookie: anonymous, and no database query", async () => {
    const s = realSession([{ token: "t", user: ALICE, expiresAt: future() }]);
    const { middleware, state } = setup(s.getAuthUser);
    const socket = createSocket({ headers: { cookie: "other=1" } });
    await run(middleware, socket);
    assert.equal(socket.data.authUser, null);
    assert.equal(state.socketIdToUsername.size, 0);
    assert.equal(s.findFirstCalls.length, 0);
  });

  it("valid cookie: authenticated as the session's user", async () => {
    const s = realSession([
      { token: "good-token", user: ALICE, expiresAt: future() },
    ]);
    const { middleware, state } = setup(s.getAuthUser);
    const socket = createSocket({
      id: "sock-v",
      headers: { cookie: cookie("good-token") },
    });
    await run(middleware, socket);
    assert.equal(socket.data.authUser, ALICE);
    assert.equal(state.socketIdToUsername.get("sock-v"), "alice");
    // Only the hash reaches the database, never the raw token.
    assert.equal(s.findFirstCalls[0].tokenHash, sha256Hex("good-token"));
    assert.ok(!JSON.stringify(s.findFirstCalls).includes("good-token"));
  });

  it("unknown cookie token: anonymous", async () => {
    const s = realSession([
      { token: "good-token", user: ALICE, expiresAt: future() },
    ]);
    const { middleware, state } = setup(s.getAuthUser);
    const socket = createSocket({ headers: { cookie: cookie("forged") } });
    await run(middleware, socket);
    assert.equal(socket.data.authUser, null);
    assert.equal(state.socketIdToUsername.size, 0);
  });

  it("expired session cookie: anonymous", async () => {
    const s = realSession([
      { token: "old-token", user: ALICE, expiresAt: past() },
    ]);
    const { middleware } = setup(s.getAuthUser);
    const socket = createSocket({ headers: { cookie: cookie("old-token") } });
    await run(middleware, socket);
    assert.equal(socket.data.authUser, null);
  });

  it("malformed percent-escape in the cookie: anonymous, not an error", async () => {
    const s = realSession([]);
    const { middleware } = setup(s.getAuthUser);
    const socket = createSocket({ headers: { cookie: cookie("%zz") } });
    const args = await run(middleware, socket);
    assert.deepEqual(args, []);
    assert.equal(socket.data.authUser, null);
  });

  it("empty cookie value: anonymous, no query", async () => {
    const s = realSession([]);
    const { middleware } = setup(s.getAuthUser);
    const socket = createSocket({
      headers: { cookie: `${SESSION_COOKIE_NAME}=` },
    });
    await run(middleware, socket);
    assert.equal(socket.data.authUser, null);
    assert.equal(s.findFirstCalls.length, 0);
  });

  it("valid auth.token (mobile) authenticates without a cookie", async () => {
    const s = realSession([
      { token: "mobile-token", user: ALICE, expiresAt: future() },
    ]);
    const { middleware } = setup(s.getAuthUser);
    const socket = createSocket({ auth: { token: "mobile-token" } });
    await run(middleware, socket);
    assert.equal(socket.data.authUser, ALICE);
  });

  it("an invalid auth.token takes precedence over a valid cookie", async () => {
    // getAuthUser prefers the Bearer credential and does not fall back to the
    // cookie when it fails. Pinned so a change in precedence is deliberate.
    const s = realSession([
      { token: "good-token", user: ALICE, expiresAt: future() },
    ]);
    const { middleware } = setup(s.getAuthUser);
    const socket = createSocket({
      headers: { cookie: cookie("good-token") },
      auth: { token: "stale-token" },
    });
    await run(middleware, socket);
    assert.equal(socket.data.authUser, null);
  });

  it("database disconnected: anonymous, no query", async () => {
    const s = realSession(
      [{ token: "good-token", user: ALICE, expiresAt: future() }],
      { dbConnected: false },
    );
    const { middleware } = setup(s.getAuthUser);
    const socket = createSocket({ headers: { cookie: cookie("good-token") } });
    const args = await run(middleware, socket);
    assert.deepEqual(args, []);
    assert.equal(socket.data.authUser, null);
    assert.equal(s.findFirstCalls.length, 0);
  });

  it("session query throws: socket still admitted, unauthenticated", async () => {
    const s = realSession([]);
    s.prisma.session.findFirst = async () => {
      throw new Error("connection reset");
    };
    const { middleware, state } = setup(s.getAuthUser);
    const socket = createSocket({ headers: { cookie: cookie("good-token") } });
    const args = await run(middleware, socket);
    assert.deepEqual(args, []);
    assert.equal(socket.data.authUser, undefined);
    assert.equal(state.socketIdToUsername.size, 0);
  });
});
