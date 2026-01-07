const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");
const os = require("os");

require("dotenv").config();

const app = express();

function parseAllowedOrigins(value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((origin) => String(origin).toLowerCase().replace(/\/+$/, ""));
}

const ALLOWED_ORIGINS = parseAllowedOrigins(process.env.CORS_ORIGINS);
const corsOptions = {
  origin(origin, callback) {
    const normalizedOrigin = String(origin || "")
      .toLowerCase()
      .replace(/\/+$/, "");

    // Allow non-browser clients (no Origin header) like curl/mobile.
    if (!origin) return callback(null, true);
    // If no allowlist provided, reflect-request-origin (dev-friendly).
    if (ALLOWED_ORIGINS.length === 0) return callback(null, true);
    return callback(null, ALLOWED_ORIGINS.includes(normalizedOrigin));
  },
  credentials: true,
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "1mb" }));

const SESSION_COOKIE_NAME = "huddle_session";
const SESSION_TTL_DAYS = 30;

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function parseCookies(headerValue) {
  const out = {};
  if (!headerValue) return out;

  const parts = String(headerValue).split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(val);
  }
  return out;
}

function setSessionCookie(res, token) {
  const maxAgeSeconds = SESSION_TTL_DAYS * 24 * 60 * 60;
  const secure = process.env.NODE_ENV === "production";

  // Minimal cookie implementation (no external deps).
  const cookie = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) cookie.push("Secure");
  res.setHeader("Set-Cookie", cookie.join("; "));
}

function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === "production";
  const cookie = [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) cookie.push("Secure");
  res.setHeader("Set-Cookie", cookie.join("; "));
}

async function getAuthUser(req) {
  if (!dbConnected || !prisma) return null;

  let token = null;

  const authHeader = req.headers.authorization;
  if (authHeader && typeof authHeader === "string") {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match && match[1]) token = match[1].trim();
  }

  if (!token) {
    const cookies = parseCookies(req.headers.cookie);
    token = cookies[SESSION_COOKIE_NAME] || null;
  }

  if (!token) return null;

  const tokenHash = sha256Hex(token);
  const now = new Date();

  const session = await prisma.session.findFirst({
    where: {
      tokenHash,
      expiresAt: { gt: now },
    },
    include: {
      user: { select: { id: true, username: true, createdAt: true } },
    },
  });

  return session?.user ?? null;
}

async function createSessionForUser(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
  );

  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  return { token, expiresAt };
}

function validateUsername(raw) {
  const username = String(raw || "")
    .trim()
    .toLowerCase();
  if (username.length < 3 || username.length > 20) return null;
  if (!/^[a-z0-9_]+$/.test(username)) return null;
  return username;
}

function validatePassword(raw) {
  const password = String(raw || "");
  if (password.length < 8 || password.length > 200) return null;
  // Require at least one lowercase, one uppercase, and one digit
  if (!/[a-z]/.test(password)) return null;
  if (!/[A-Z]/.test(password)) return null;
  if (!/\d/.test(password)) return null;
  return password;
}

function validateRoomId(raw) {
  const roomId = String(raw || "").trim();
  if (!roomId) return null;
  if (roomId.length > 200) return null;
  return roomId;
}

async function requireAuth(req, res, next) {
  try {
    const user = await getAuthUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    req.authUser = user;
    return next();
  } catch (err) {
    console.error("Auth error:", err);
    return res.status(500).json({ error: "auth_error" });
  }
}

// --- Auth + Saved Rooms REST API ---
app.get("/api/auth/me", async (req, res) => {
  try {
    const user = await getAuthUser(req);
    return res.json({ user });
  } catch (err) {
    console.error("/api/auth/me failed:", err);
    return res.status(500).json({ error: "server_error" });
  }
});

app.post("/api/auth/register", async (req, res) => {
  try {
    if (!dbConnected || !prisma) {
      return res.status(503).json({ error: "db_unavailable" });
    }

    const username = validateUsername(req.body?.username);
    const password = validatePassword(req.body?.password);
    if (!username) {
      return res
        .status(400)
        .json({ error: "invalid_username", hint: "3-20 chars: a-z 0-9 _" });
    }
    if (!password) {
      return res
        .status(400)
        .json({ error: "invalid_password", hint: "min 8 characters" });
    }

    const user = await prisma.user.create({
      data: {
        username,
        passwordHash: hashPassword(password),
      },
      select: { id: true, username: true, createdAt: true },
    });

    const { token } = await createSessionForUser(user.id);

    setSessionCookie(res, token);
    return res.json({ user });
  } catch (err) {
    if (err && err.code === "P2002") {
      return res.status(409).json({ error: "username_taken" });
    }
    console.error("/api/auth/register failed:", err);
    return res.status(500).json({ error: "server_error" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    if (!dbConnected || !prisma) {
      return res.status(503).json({ error: "db_unavailable" });
    }

    const username = validateUsername(req.body?.username);
    const password = validatePassword(req.body?.password);
    if (!username || !password) {
      return res.status(400).json({ error: "invalid_credentials" });
    }

    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true, passwordHash: true, createdAt: true },
    });

    const ok = user ? verifyPassword(password, user.passwordHash) : false;
    if (!ok) return res.status(401).json({ error: "invalid_credentials" });

    const { token } = await createSessionForUser(user.id);

    setSessionCookie(res, token);
    return res.json({
      user: { id: user.id, username: user.username, createdAt: user.createdAt },
    });
  } catch (err) {
    console.error("/api/auth/login failed:", err);
    return res.status(500).json({ error: "server_error" });
  }
});

// Token-returning variants (recommended for mobile).
app.post("/api/auth/register-token", async (req, res) => {
  try {
    if (!dbConnected || !prisma) {
      return res.status(503).json({ error: "db_unavailable" });
    }

    const username = validateUsername(req.body?.username);
    const password = validatePassword(req.body?.password);
    if (!username) {
      return res
        .status(400)
        .json({ error: "invalid_username", hint: "3-20 chars: a-z 0-9 _" });
    }
    if (!password) {
      return res
        .status(400)
        .json({ error: "invalid_password", hint: "min 8 characters" });
    }

    const user = await prisma.user.create({
      data: {
        username,
        passwordHash: hashPassword(password),
      },
      select: { id: true, username: true, createdAt: true },
    });

    const { token, expiresAt } = await createSessionForUser(user.id);
    return res.json({ user, token, expiresAt });
  } catch (err) {
    if (err && err.code === "P2002") {
      return res.status(409).json({ error: "username_taken" });
    }
    console.error("/api/auth/register-token failed:", err);
    return res.status(500).json({ error: "server_error" });
  }
});

app.post("/api/auth/login-token", async (req, res) => {
  try {
    if (!dbConnected || !prisma) {
      return res.status(503).json({ error: "db_unavailable" });
    }

    const username = validateUsername(req.body?.username);
    const password = validatePassword(req.body?.password);
    if (!username || !password) {
      return res.status(400).json({ error: "invalid_credentials" });
    }

    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true, passwordHash: true, createdAt: true },
    });

    const ok = user ? verifyPassword(password, user.passwordHash) : false;
    if (!ok) return res.status(401).json({ error: "invalid_credentials" });

    const { token, expiresAt } = await createSessionForUser(user.id);
    return res.json({
      user: { id: user.id, username: user.username, createdAt: user.createdAt },
      token,
      expiresAt,
    });
  } catch (err) {
    console.error("/api/auth/login-token failed:", err);
    return res.status(500).json({ error: "server_error" });
  }
});

app.post("/api/auth/logout", async (req, res) => {
  try {
    if (dbConnected && prisma) {
      let token = null;

      const authHeader = req.headers.authorization;
      if (authHeader && typeof authHeader === "string") {
        const match = authHeader.match(/^Bearer\s+(.+)$/i);
        if (match && match[1]) token = match[1].trim();
      }

      if (!token) {
        const cookies = parseCookies(req.headers.cookie);
        token = cookies[SESSION_COOKIE_NAME] || null;
      }

      if (token) {
        const tokenHash = sha256Hex(token);
        await prisma.session.deleteMany({ where: { tokenHash } });
      }
    }
    clearSessionCookie(res);
    return res.json({ ok: true });
  } catch (err) {
    console.error("/api/auth/logout failed:", err);
    clearSessionCookie(res);
    return res.json({ ok: true });
  }
});

app.get("/api/saved-rooms", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser.id;
    const saved = await prisma.savedRoom.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { roomId: true, createdAt: true },
    });
    return res.json({ rooms: saved });
  } catch (err) {
    console.error("/api/saved-rooms failed:", err);
    return res.status(500).json({ error: "server_error" });
  }
});

app.post("/api/saved-rooms", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser.id;
    const roomId = validateRoomId(req.body?.roomId);
    if (!roomId) return res.status(400).json({ error: "invalid_roomId" });

    const saved = await prisma.savedRoom.upsert({
      where: { userId_roomId: { userId, roomId } },
      update: {},
      create: { userId, roomId },
      select: { roomId: true, createdAt: true },
    });

    return res.json({ room: saved });
  } catch (err) {
    console.error("POST /api/saved-rooms failed:", err);
    return res.status(500).json({ error: "server_error" });
  }
});

app.delete("/api/saved-rooms/:roomId", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser.id;
    const roomId = validateRoomId(req.params.roomId);
    if (!roomId) return res.status(400).json({ error: "invalid_roomId" });

    await prisma.savedRoom.deleteMany({ where: { userId, roomId } });
    return res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/saved-rooms failed:", err);
    return res.status(500).json({ error: "server_error" });
  }
});

// Initialize Prisma with better error handling
let prisma;
let dbConnected = false;

try {
  prisma = new PrismaClient({
    errorFormat: "pretty",
  });

  // Test connection
  prisma
    .$connect()
    .then(() => {
      dbConnected = true;
      console.log("✓ Database connected successfully");
    })
    .catch((err) => {
      console.warn("⚠ Database connection failed:", err.message);
      dbConnected = false;
    });
} catch (err) {
  console.error("✗ Failed to initialize Prisma:", err.message);
  dbConnected = false;
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      const normalizedOrigin = String(origin || "")
        .toLowerCase()
        .replace(/\/+$/, "");

      // Allow non-browser clients (no Origin header) like curl/mobile.
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.length === 0) return callback(null, true);
      return callback(null, ALLOWED_ORIGINS.includes(normalizedOrigin));
    },
    credentials: true,
    methods: ["GET", "POST"],
  },
});

// Map socket.id -> authenticated username (if available).
const socketIdToUsername = new Map();

// Attach auth user to socket at connection time (cookie or Bearer token).
io.use(async (socket, next) => {
  try {
    const headers = { ...(socket.handshake?.headers || {}) };

    // Mobile can pass a token via socket auth (or it can be provided as an Authorization header).
    const token = socket.handshake?.auth?.token;
    if (token && typeof token === "string" && token.trim()) {
      headers.authorization = `Bearer ${token.trim()}`;
    }

    const user = await getAuthUser({ headers });
    socket.data.authUser = user;

    if (user?.username) {
      socketIdToUsername.set(socket.id, user.username);
    }
  } catch {
    // Best-effort only; chat still works without auth.
  }
  return next();
});

// Simple in-memory room state so late joiners can sync to the current URL/time.
// Note: this resets when the server restarts.
const roomState = new Map();

// In-memory media state (mic/cam/screen) so late joiners can render UI correctly.
// Map<roomId, Map<socketId, {mic:boolean, cam:boolean, screen:boolean}>>
const roomMediaState = new Map();

// Minimal moderation primitives (in-memory for now).
// Map<roomId, hostSocketId>
const roomHost = new Map();
// Map<roomId, Set<bannedSocketId>>
const roomBans = new Map();

// Room passwords (in-memory for now).
// Map<roomId, string> where string is `${saltHex}:${hashHex}`
const roomPasswordHash = new Map();

// Shared wheel picker state (in-memory for now).
// Map<roomId, { entries: string[], lastSpin?: { index:number, result:string, entryCount:number, spunAt:number, senderId?:string } }>
const roomWheel = new Map();

// Room playlists active state (tracks which playlist is active and current item)
// Map<roomId, { activePlaylistId: string | null, currentItemIndex: number }>
const roomPlaylistActive = new Map();

function getRoomWheel(roomId) {
  const existing = roomWheel.get(roomId);
  if (existing && Array.isArray(existing.entries)) return existing;
  const created = { entries: [] };
  roomWheel.set(roomId, created);
  return created;
}

function emitWheelStateTo(socket, roomId) {
  const wheel = getRoomWheel(roomId);
  socket.emit("wheel_state", {
    roomId,
    entries: wheel.entries,
    lastSpin: wheel.lastSpin ?? null,
  });
}

function emitWheelStateToRoom(roomId) {
  const wheel = getRoomWheel(roomId);
  io.to(roomId).emit("wheel_state", {
    roomId,
    entries: wheel.entries,
    lastSpin: wheel.lastSpin ?? null,
  });
}

// Playlist helper functions
async function getPlaylistsForRoom(roomId) {
  if (!dbConnected || !prisma) return [];
  try {
    const playlists = await prisma.roomPlaylist.findMany({
      where: { roomId },
      include: {
        items: {
          orderBy: { position: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return playlists.map((p) => ({
      id: p.id,
      roomId: p.roomId,
      name: p.name,
      description: p.description,
      createdBy: p.createdBy,
      createdByUsername: p.createdByUsername,
      createdAt: p.createdAt.getTime(),
      updatedAt: p.updatedAt.getTime(),
      isDefault: p.isDefault,
      settings: {
        loop: p.loop,
        shuffle: p.shuffle,
        autoPlay: p.autoPlay,
      },
      items: p.items.map((item) => ({
        id: item.id,
        videoUrl: item.videoUrl,
        title: item.title,
        addedBy: item.addedBy,
        addedByUsername: item.addedByUsername,
        addedAt: item.addedAt.getTime(),
        duration: item.duration,
        thumbnail: item.thumbnail,
      })),
    }));
  } catch (err) {
    console.error("Failed to get playlists:", err.message);
    return [];
  }
}

async function emitPlaylistStateTo(socket, roomId) {
  const playlists = await getPlaylistsForRoom(roomId);
  const activeState = roomPlaylistActive.get(roomId) || {
    activePlaylistId: null,
    currentItemIndex: 0,
  };

  socket.emit("playlist_state", {
    roomId,
    playlists,
    activePlaylistId: activeState.activePlaylistId,
    currentItemIndex: activeState.currentItemIndex,
  });
}

async function emitPlaylistStateToRoom(roomId) {
  const playlists = await getPlaylistsForRoom(roomId);
  const activeState = roomPlaylistActive.get(roomId) || {
    activePlaylistId: null,
    currentItemIndex: 0,
  };

  io.to(roomId).emit("playlist_state", {
    roomId,
    playlists,
    activePlaylistId: activeState.activePlaylistId,
    currentItemIndex: activeState.currentItemIndex,
  });
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const [salt, hashHex] = String(stored).split(":");
  if (!salt || !hashHex) return false;
  const computed = crypto
    .scryptSync(String(password ?? ""), salt, 64)
    .toString("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(hashHex, "hex"),
      Buffer.from(computed, "hex")
    );
  } catch {
    return false;
  }
}

const CHAT_HISTORY_LIMIT = 50;
const ACTIVITY_HISTORY_LIMIT = 100;

function normalizeRoomId(raw) {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw.roomId === "string") return raw.roomId;
  return null;
}

async function emitActivityHistory(socket, roomId) {
  try {
    // Skip if database is not connected
    if (!dbConnected || !prisma) {
      socket.emit("activity_history", { roomId, events: [] });
      return;
    }

    const recent = await prisma.roomActivity.findMany({
      where: { roomId },
      orderBy: { createdAt: "desc" },
      take: ACTIVITY_HISTORY_LIMIT,
    });

    socket.emit("activity_history", {
      roomId,
      events: recent.reverse().map((e) => ({
        id: e.id,
        roomId: e.roomId,
        kind: e.kind,
        action: e.action,
        timestamp: e.timestamp,
        videoUrl: e.videoUrl,
        senderId: e.senderId,
        senderUsername: e.senderUsername ?? null,
        createdAt: e.createdAt,
      })),
    });
  } catch (err) {
    console.error("Failed to load activity history:", err.message);
    socket.emit("activity_history", { roomId, events: [] });
  }
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Ensure we don't leak stale mappings.
  socket.on("disconnect", () => {
    socketIdToUsername.delete(socket.id);
  });

  const joinedRooms = new Set();

  // Handle joining a room
  socket.on("join_room", async (payload) => {
    const roomId =
      typeof payload === "string"
        ? payload
        : payload && typeof payload === "object"
          ? payload.roomId
          : undefined;
    const password =
      typeof payload === "object" && payload ? payload.password : undefined;

    if (!roomId || typeof roomId !== "string") return;

    const banned = roomBans.get(roomId);
    if (banned && banned.has(socket.id)) {
      socket.emit("room_banned", { roomId });
      return;
    }

    const storedHash = roomPasswordHash.get(roomId);
    if (storedHash) {
      const ok = verifyPassword(password, storedHash);
      if (!ok) {
        socket.emit("room_requires_password", {
          roomId,
          reason: password ? "invalid" : "required",
        });
        return;
      }
    }

    // If the client re-sends join_room (retries, double-mount in dev, etc.),
    // don't spam join activity or user_joined events.
    if (socket.rooms.has(roomId)) {
      try {
        const room = io.sockets.adapter.rooms.get(roomId);
        const users = room
          ? Array.from(room).filter((id) => id !== socket.id)
          : [];

        const usernames = {};
        for (const id of users) {
          usernames[id] = socketIdToUsername.get(id) || null;
        }

        if (!roomHost.has(roomId)) {
          roomHost.set(roomId, socket.id);
        }

        io.to(roomId).emit("room_host", {
          roomId,
          hostId: roomHost.get(roomId),
        });

        const stateMap = roomMediaState.get(roomId);
        const mediaStates = {};
        if (stateMap) {
          for (const [sid, st] of stateMap.entries()) {
            if (sid === socket.id) continue;
            mediaStates[sid] = st;
          }
        }

        socket.emit("room_users", {
          roomId,
          users,
          usernames,
          mediaStates,
          hostId: roomHost.get(roomId),
        });

        socket.emit("room_password_status", {
          roomId,
          hasPassword: roomPasswordHash.has(roomId),
        });

        emitWheelStateTo(socket, roomId);
        emitPlaylistStateTo(socket, roomId);
      } catch (err) {
        console.error("Failed to re-emit room snapshot", err);
      }
      return;
    }

    socket.join(roomId);
    joinedRooms.add(roomId);
    console.log(`User ${socket.id} joined room: ${roomId}`);
    // Notify others in the room (optional)
    {
      const username =
        socket.data?.authUser?.username ||
        socketIdToUsername.get(socket.id) ||
        null;
      socket.to(roomId).emit("user_joined", { socketId: socket.id, username });
    }

    // Provide the joiner a list of current users so they can establish WebRTC.
    try {
      const room = io.sockets.adapter.rooms.get(roomId);
      const users = room
        ? Array.from(room).filter((id) => id !== socket.id)
        : [];

      const usernames = {};
      for (const id of users) {
        usernames[id] = socketIdToUsername.get(id) || null;
      }

      if (!roomHost.has(roomId)) {
        roomHost.set(roomId, socket.id);
      }

      io.to(roomId).emit("room_host", {
        roomId,
        hostId: roomHost.get(roomId),
      });

      const stateMap = roomMediaState.get(roomId);
      const mediaStates = {};
      if (stateMap) {
        for (const [sid, st] of stateMap.entries()) {
          if (sid === socket.id) continue;
          mediaStates[sid] = st;
        }
      }

      socket.emit("room_users", {
        roomId,
        users,
        usernames,
        mediaStates,
        hostId: roomHost.get(roomId),
      });

      socket.emit("room_password_status", {
        roomId,
        hasPassword: roomPasswordHash.has(roomId),
      });

      emitWheelStateTo(socket, roomId);
      emitPlaylistStateTo(socket, roomId);
    } catch (err) {
      console.error("Failed to emit room_users", err);
      socket.emit("room_users", {
        roomId,
        users: [],
        usernames: {},
        mediaStates: {},
        hostId: roomHost.get(roomId) || null,
      });

      socket.emit("room_password_status", {
        roomId,
        hasPassword: roomPasswordHash.has(roomId),
      });

      emitWheelStateTo(socket, roomId);
      emitPlaylistStateTo(socket, roomId);
    }

    // Persist join as an activity event (optional but useful for moderation/audit).
    try {
      if (dbConnected && prisma) {
        const senderUsername =
          socket.data?.authUser?.username ||
          socketIdToUsername.get(socket.id) ||
          null;
        const evt = await prisma.roomActivity.create({
          data: {
            roomId,
            kind: "join",
            senderId: socket.id,
            senderUsername,
          },
        });

        socket.to(roomId).emit("activity_event", {
          id: evt.id,
          roomId: evt.roomId,
          kind: evt.kind,
          action: evt.action,
          timestamp: evt.timestamp,
          videoUrl: evt.videoUrl,
          senderId: evt.senderId,
          senderUsername: evt.senderUsername ?? senderUsername,
          createdAt: evt.createdAt,
        });
      }
    } catch (err) {
      console.error("Failed to persist join activity:", err.message);
    }

    // Send current room state to this new joiner.
    const state = roomState.get(roomId);

    // Calculate estimated current timestamp if video is playing
    // (same logic as request_room_state)
    let estimatedTimestamp = state?.timestamp;
    if (state && state.isPlaying === true) {
      const now = Date.now();
      const prevTimestamp =
        typeof state.timestamp === "number" ? state.timestamp : 0;
      const prevUpdatedAt =
        typeof state.updatedAt === "number" ? state.updatedAt : now;
      const prevSpeed =
        typeof state.playbackSpeed === "number" &&
        Number.isFinite(state.playbackSpeed)
          ? state.playbackSpeed
          : 1;
      estimatedTimestamp =
        prevTimestamp + Math.max(0, (now - prevUpdatedAt) / 1000) * prevSpeed;
    }

    socket.emit("room_state", {
      roomId,
      serverNow: Date.now(), // For clock sync
      ...(state || {}),
      timestamp: estimatedTimestamp,
      // Ensure isPlaying is always defined (default to false if missing)
      isPlaying: state?.isPlaying ?? false,
    });

    // Send recent chat history for this room.
    try {
      if (dbConnected && prisma) {
        const recent = await prisma.roomMessage.findMany({
          where: { roomId },
          orderBy: { createdAt: "desc" },
          take: CHAT_HISTORY_LIMIT,
        });

        socket.emit("chat_history", {
          roomId,
          messages: recent.reverse().map((m) => ({
            id: m.id,
            roomId: m.roomId,
            senderId: m.senderId,
            senderUsername: m.senderUsername ?? null,
            text: m.text,
            createdAt: m.createdAt,
          })),
        });
      } else {
        socket.emit("chat_history", { roomId, messages: [] });
      }
    } catch (err) {
      console.error("Failed to load chat history:", err.message);
      socket.emit("chat_history", { roomId, messages: [] });
    }

    await emitActivityHistory(socket, roomId);
  });

  // Handle explicitly leaving a room (Android emits this when navigating away).
  socket.on("leave_room", async (payload) => {
    const roomId =
      typeof payload === "string"
        ? payload
        : payload && typeof payload === "object"
          ? payload.roomId
          : undefined;

    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    try {
      socket.leave(roomId);
    } catch {
      // ignore
    }
    joinedRooms.delete(roomId);

    // Clean up in-memory media state.
    const map = roomMediaState.get(roomId);
    if (map) {
      map.delete(socket.id);
      if (map.size === 0) roomMediaState.delete(roomId);
    }

    // Notify peers for WebRTC cleanup.
    {
      const username =
        socket.data?.authUser?.username ||
        socketIdToUsername.get(socket.id) ||
        null;
      socket.to(roomId).emit("user_left", { socketId: socket.id, username });
    }
    socket.to(roomId).emit("webrtc_speaking", {
      roomId,
      from: socket.id,
      speaking: false,
    });
    socket.to(roomId).emit("webrtc_media_state", {
      roomId,
      from: socket.id,
      state: { mic: false, cam: false, screen: false },
    });

    // Reassign host if needed.
    if (roomHost.get(roomId) === socket.id) {
      const room = io.sockets.adapter.rooms.get(roomId);
      const remaining = room ? Array.from(room) : [];

      if (remaining.length > 0) {
        roomHost.set(roomId, remaining[0]);
        io.to(roomId).emit("room_host", {
          roomId,
          hostId: roomHost.get(roomId),
        });
      } else {
        roomHost.delete(roomId);
        roomBans.delete(roomId);
        roomPasswordHash.delete(roomId);
        roomWheel.delete(roomId);
      }
    }

    // Persist leave as an activity event.
    try {
      if (dbConnected && prisma) {
        const senderUsername =
          socket.data?.authUser?.username ||
          socketIdToUsername.get(socket.id) ||
          null;

        const evt = await prisma.roomActivity.create({
          data: {
            roomId,
            kind: "leave",
            senderId: socket.id,
            senderUsername,
          },
        });

        io.to(roomId).emit("activity_event", {
          id: evt.id,
          roomId: evt.roomId,
          kind: evt.kind,
          action: evt.action,
          timestamp: evt.timestamp,
          videoUrl: evt.videoUrl,
          senderId: evt.senderId,
          senderUsername: evt.senderUsername ?? senderUsername,
          createdAt: evt.createdAt,
        });
      }
    } catch (err) {
      console.error("Failed to persist explicit leave activity:", err.message);
    }
  });

  // --- Wheel picker (shared random picker) ---
  socket.on("wheel_get", (data) => {
    const { roomId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    emitWheelStateTo(socket, roomId);
  });

  socket.on("wheel_add_entry", (data) => {
    const { roomId, text } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    const raw = typeof text === "string" ? text : "";
    const cleaned = raw.trim().slice(0, 200);
    if (!cleaned) return;

    const wheel = getRoomWheel(roomId);
    if (wheel.entries.length >= 1000) return;
    wheel.entries.push(cleaned);
    emitWheelStateToRoom(roomId);
  });

  socket.on("wheel_remove_entry", (data) => {
    const { roomId, index } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    const i = typeof index === "number" ? index : Number(index);
    if (!Number.isFinite(i)) return;

    const wheel = getRoomWheel(roomId);
    const idx = Math.floor(i);
    if (idx < 0 || idx >= wheel.entries.length) return;
    wheel.entries.splice(idx, 1);
    emitWheelStateToRoom(roomId);
  });

  socket.on("wheel_clear", (data) => {
    const { roomId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    const wheel = getRoomWheel(roomId);
    wheel.entries = [];
    wheel.lastSpin = undefined;
    emitWheelStateToRoom(roomId);
  });

  socket.on("wheel_spin", (data) => {
    const { roomId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    const wheel = getRoomWheel(roomId);
    const entryCount = wheel.entries.length;
    if (entryCount <= 0) return;

    const index = Math.floor(Math.random() * entryCount);
    const result = wheel.entries[index];
    const spunAt = Date.now();

    wheel.lastSpin = {
      index,
      result,
      entryCount,
      spunAt,
      senderId: socket.id,
    };

    io.to(roomId).emit("wheel_spun", {
      roomId,
      index,
      result,
      entryCount,
      spunAt,
      senderId: socket.id,
      entries: wheel.entries,
    });

    emitWheelStateToRoom(roomId);
  });

  // --- Playlist management ---
  socket.on("playlist_get", async (data) => {
    const { roomId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    await emitPlaylistStateTo(socket, roomId);
  });

  socket.on("playlist_create", async (data) => {
    const { roomId, name, description, settings } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    if (!dbConnected || !prisma) return;

    const playlistName =
      typeof name === "string" ? name.trim().slice(0, 100) : "";
    if (!playlistName) return;

    const senderUsername =
      socket.data?.authUser?.username ||
      socketIdToUsername.get(socket.id) ||
      null;

    try {
      await prisma.roomPlaylist.create({
        data: {
          roomId,
          name: playlistName,
          description:
            typeof description === "string" ? description.slice(0, 500) : null,
          createdBy: socket.id,
          createdByUsername: senderUsername,
          loop: settings?.loop ?? false,
          shuffle: settings?.shuffle ?? false,
          autoPlay: settings?.autoPlay ?? true,
        },
      });

      await emitPlaylistStateToRoom(roomId);
    } catch (err) {
      console.error("Failed to create playlist:", err.message);
    }
  });

  socket.on("playlist_update", async (data) => {
    const { roomId, playlistId, name, description, settings } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!playlistId || typeof playlistId !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    if (!dbConnected || !prisma) return;

    try {
      const updateData = {};
      if (typeof name === "string") {
        updateData.name = name.trim().slice(0, 100);
      }
      if (typeof description === "string") {
        updateData.description = description.slice(0, 500);
      }
      if (settings && typeof settings === "object") {
        if (typeof settings.loop === "boolean") updateData.loop = settings.loop;
        if (typeof settings.shuffle === "boolean")
          updateData.shuffle = settings.shuffle;
        if (typeof settings.autoPlay === "boolean")
          updateData.autoPlay = settings.autoPlay;
      }

      if (Object.keys(updateData).length === 0) return;

      await prisma.roomPlaylist.update({
        where: { id: playlistId },
        data: updateData,
      });

      await emitPlaylistStateToRoom(roomId);
    } catch (err) {
      console.error("Failed to update playlist:", err.message);
    }
  });

  socket.on("playlist_delete", async (data) => {
    const { roomId, playlistId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!playlistId || typeof playlistId !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    if (!dbConnected || !prisma) return;

    try {
      await prisma.roomPlaylist.delete({
        where: { id: playlistId },
      });

      // Clear active state if this was the active playlist
      const activeState = roomPlaylistActive.get(roomId);
      if (activeState && activeState.activePlaylistId === playlistId) {
        roomPlaylistActive.delete(roomId);
      }

      await emitPlaylistStateToRoom(roomId);
    } catch (err) {
      console.error("Failed to delete playlist:", err.message);
    }
  });

  socket.on("playlist_add_item", async (data) => {
    const { roomId, playlistId, videoUrl, title, duration, thumbnail } =
      data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!playlistId || typeof playlistId !== "string") return;
    if (!videoUrl || typeof videoUrl !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    if (!dbConnected || !prisma) return;

    const itemTitle =
      typeof title === "string" ? title.trim().slice(0, 200) : "Untitled";
    const senderUsername =
      socket.data?.authUser?.username ||
      socketIdToUsername.get(socket.id) ||
      null;

    try {
      // Get the highest position in the playlist
      const lastItem = await prisma.roomPlaylistItem.findFirst({
        where: { playlistId },
        orderBy: { position: "desc" },
        select: { position: true },
      });

      const nextPosition = (lastItem?.position ?? -1) + 1;

      await prisma.roomPlaylistItem.create({
        data: {
          playlistId,
          videoUrl: videoUrl.slice(0, 2000),
          title: itemTitle,
          duration: typeof duration === "number" ? duration : null,
          thumbnail:
            typeof thumbnail === "string" ? thumbnail.slice(0, 2000) : null,
          addedBy: socket.id,
          addedByUsername: senderUsername,
          position: nextPosition,
        },
      });

      await emitPlaylistStateToRoom(roomId);
    } catch (err) {
      console.error("Failed to add playlist item:", err.message);
    }
  });

  socket.on("playlist_remove_item", async (data) => {
    const { roomId, playlistId, itemId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!playlistId || typeof playlistId !== "string") return;
    if (!itemId || typeof itemId !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    if (!dbConnected || !prisma) return;

    try {
      await prisma.roomPlaylistItem.delete({
        where: { id: itemId },
      });

      await emitPlaylistStateToRoom(roomId);
    } catch (err) {
      console.error("Failed to remove playlist item:", err.message);
    }
  });

  socket.on("playlist_reorder_items", async (data) => {
    const { roomId, playlistId, itemIds } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!playlistId || typeof playlistId !== "string") return;
    if (!Array.isArray(itemIds)) return;
    if (!socket.rooms.has(roomId)) return;
    if (!dbConnected || !prisma) return;

    try {
      // Get current active state to track the currently playing item
      const activeState = roomPlaylistActive.get(roomId);
      let currentPlayingItemId = null;

      // If this is the active playlist, find the currently playing item
      if (activeState && activeState.activePlaylistId === playlistId) {
        const playlist = await prisma.roomPlaylist.findUnique({
          where: { id: playlistId },
          include: {
            items: {
              orderBy: { position: "asc" },
            },
          },
        });

        if (playlist && playlist.items[activeState.currentItemIndex]) {
          currentPlayingItemId =
            playlist.items[activeState.currentItemIndex].id;
        }
      }

      // Update positions for all items
      await prisma.$transaction(
        itemIds.map((id, index) =>
          prisma.roomPlaylistItem.update({
            where: { id },
            data: { position: index },
          })
        )
      );

      // If we were tracking a currently playing item, update the index to its new position
      if (currentPlayingItemId && activeState) {
        const newIndex = itemIds.indexOf(currentPlayingItemId);
        if (newIndex !== -1) {
          roomPlaylistActive.set(roomId, {
            activePlaylistId: playlistId,
            currentItemIndex: newIndex,
          });
        }
      }

      await emitPlaylistStateToRoom(roomId);
    } catch (err) {
      console.error("Failed to reorder playlist items:", err.message);
    }
  });

  socket.on("playlist_set_active", async (data) => {
    const { roomId, playlistId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;

    // playlistId can be null to clear active playlist
    const activeId = typeof playlistId === "string" ? playlistId : null;

    roomPlaylistActive.set(roomId, {
      activePlaylistId: activeId,
      currentItemIndex: 0,
    });

    await emitPlaylistStateToRoom(roomId);
  });

  socket.on("playlist_play_item", async (data) => {
    const { roomId, playlistId, itemId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!playlistId || typeof playlistId !== "string") return;
    if (!itemId || typeof itemId !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    if (!dbConnected || !prisma) return;

    try {
      // Get the playlist with items
      const playlist = await prisma.roomPlaylist.findUnique({
        where: { id: playlistId },
        include: {
          items: {
            orderBy: { position: "asc" },
          },
        },
      });

      if (!playlist) return;

      const itemIndex = playlist.items.findIndex((item) => item.id === itemId);
      if (itemIndex === -1) return;

      const item = playlist.items[itemIndex];

      // Update active state
      roomPlaylistActive.set(roomId, {
        activePlaylistId: playlistId,
        currentItemIndex: itemIndex,
      });

      // Emit playlist item played event to change the video
      io.to(roomId).emit("playlist_item_played", {
        roomId,
        playlistId,
        itemId: item.id,
        itemIndex,
        videoUrl: item.videoUrl,
        title: item.title,
      });

      await emitPlaylistStateToRoom(roomId);
    } catch (err) {
      console.error("Failed to play playlist item:", err.message);
    }
  });

  socket.on("playlist_next", async (data) => {
    const { roomId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    if (!dbConnected || !prisma) return;

    const activeState = roomPlaylistActive.get(roomId);
    if (!activeState || !activeState.activePlaylistId) return;

    try {
      const playlist = await prisma.roomPlaylist.findUnique({
        where: { id: activeState.activePlaylistId },
        include: {
          items: {
            orderBy: { position: "asc" },
          },
        },
      });

      if (!playlist || playlist.items.length === 0) return;

      let nextIndex = activeState.currentItemIndex + 1;

      // Handle loop/end of playlist
      if (nextIndex >= playlist.items.length) {
        if (playlist.loop) {
          nextIndex = 0;
        } else {
          return; // End of playlist
        }
      }

      // Handle shuffle
      if (playlist.shuffle) {
        nextIndex = Math.floor(Math.random() * playlist.items.length);
      }

      const item = playlist.items[nextIndex];

      roomPlaylistActive.set(roomId, {
        activePlaylistId: playlist.id,
        currentItemIndex: nextIndex,
      });

      io.to(roomId).emit("playlist_item_played", {
        roomId,
        playlistId: playlist.id,
        itemId: item.id,
        itemIndex: nextIndex,
        videoUrl: item.videoUrl,
        title: item.title,
      });

      await emitPlaylistStateToRoom(roomId);
    } catch (err) {
      console.error("Failed to play next playlist item:", err.message);
    }
  });

  socket.on("playlist_previous", async (data) => {
    const { roomId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!socket.rooms.has(roomId)) return;
    if (!dbConnected || !prisma) return;

    const activeState = roomPlaylistActive.get(roomId);
    if (!activeState || !activeState.activePlaylistId) return;

    try {
      const playlist = await prisma.roomPlaylist.findUnique({
        where: { id: activeState.activePlaylistId },
        include: {
          items: {
            orderBy: { position: "asc" },
          },
        },
      });

      if (!playlist || playlist.items.length === 0) return;

      let prevIndex = activeState.currentItemIndex - 1;

      if (prevIndex < 0) {
        if (playlist.loop) {
          prevIndex = playlist.items.length - 1;
        } else {
          prevIndex = 0;
        }
      }

      const item = playlist.items[prevIndex];

      roomPlaylistActive.set(roomId, {
        activePlaylistId: playlist.id,
        currentItemIndex: prevIndex,
      });

      io.to(roomId).emit("playlist_item_played", {
        roomId,
        playlistId: playlist.id,
        itemId: item.id,
        itemIndex: prevIndex,
        videoUrl: item.videoUrl,
        title: item.title,
      });

      await emitPlaylistStateToRoom(roomId);
    } catch (err) {
      console.error("Failed to play previous playlist item:", err.message);
    }
  });

  // Host-only: set or clear room password.
  socket.on("set_room_password", async (data) => {
    const { roomId, password } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (roomHost.get(roomId) !== socket.id) return;

    const pw = typeof password === "string" ? password : "";
    if (!pw) {
      roomPasswordHash.delete(roomId);
      io.to(roomId).emit("room_password_status", {
        roomId,
        hasPassword: false,
      });
      return;
    }

    roomPasswordHash.set(roomId, hashPassword(pw));
    io.to(roomId).emit("room_password_status", {
      roomId,
      hasPassword: true,
    });

    // Optional audit event.
    try {
      if (dbConnected && prisma) {
        const senderUsername =
          socket.data?.authUser?.username ||
          socketIdToUsername.get(socket.id) ||
          null;
        const evt = await prisma.roomActivity.create({
          data: {
            roomId,
            kind: "password",
            senderId: socket.id,
            senderUsername,
          },
        });
        io.to(roomId).emit("activity_event", {
          id: evt.id,
          roomId: evt.roomId,
          kind: evt.kind,
          action: evt.action,
          timestamp: evt.timestamp,
          videoUrl: evt.videoUrl,
          senderId: evt.senderId,
          senderUsername: evt.senderUsername ?? senderUsername,
          createdAt: evt.createdAt,
        });
      }
    } catch (err) {
      console.error("Failed to persist password activity:", err.message);
    }
  });

  // Host-only: kick + ban (in-memory) a target socket from a room.
  socket.on("kick_user", async (data) => {
    const { roomId, targetId } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!targetId || typeof targetId !== "string") return;
    if (roomHost.get(roomId) !== socket.id) return;

    // Add to ban list for this room.
    let banned = roomBans.get(roomId);
    if (!banned) {
      banned = new Set();
      roomBans.set(roomId, banned);
    }
    banned.add(targetId);

    // Optional audit event.
    try {
      if (dbConnected && prisma) {
        const senderUsername =
          socket.data?.authUser?.username ||
          socketIdToUsername.get(socket.id) ||
          null;
        const evt = await prisma.roomActivity.create({
          data: {
            roomId,
            kind: "kick",
            senderId: socket.id,
            senderUsername,
          },
        });
        io.to(roomId).emit("activity_event", {
          id: evt.id,
          roomId: evt.roomId,
          kind: evt.kind,
          action: evt.action,
          timestamp: evt.timestamp,
          videoUrl: evt.videoUrl,
          senderId: evt.senderId,
          senderUsername: evt.senderUsername ?? senderUsername,
          createdAt: evt.createdAt,
        });
      }
    } catch (err) {
      console.error("Failed to persist kick activity:", err.message);
    }

    // Notify + disconnect the target.
    io.to(targetId).emit("room_banned", { roomId });
    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) {
      try {
        targetSocket.disconnect(true);
      } catch {
        // ignore
      }
    }
  });

  // --- WebRTC signaling (socket.io relays between peers) ---
  // We keep signaling on the server very small: validate room membership, then
  // forward to the target socket id.
  const isSocketInRoom = (roomId, socketId) => {
    try {
      const room = io.sockets.adapter.rooms.get(roomId);
      return room ? room.has(socketId) : false;
    } catch {
      return false;
    }
  };

  socket.on("webrtc_offer", (data) => {
    const { roomId, to, sdp } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!to || typeof to !== "string") return;
    if (!sdp) return;
    if (!isSocketInRoom(roomId, socket.id) || !isSocketInRoom(roomId, to))
      return;
    io.to(to).emit("webrtc_offer", { roomId, from: socket.id, sdp });
  });

  socket.on("webrtc_answer", (data) => {
    const { roomId, to, sdp } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!to || typeof to !== "string") return;
    if (!sdp) return;
    if (!isSocketInRoom(roomId, socket.id) || !isSocketInRoom(roomId, to))
      return;
    io.to(to).emit("webrtc_answer", { roomId, from: socket.id, sdp });
  });

  socket.on("webrtc_ice", (data) => {
    const { roomId, to, candidate } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!to || typeof to !== "string") return;
    if (!candidate) return;
    if (!isSocketInRoom(roomId, socket.id) || !isSocketInRoom(roomId, to))
      return;
    io.to(to).emit("webrtc_ice", { roomId, from: socket.id, candidate });
  });

  socket.on("webrtc_media_state", async (data) => {
    const { roomId, state } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!state || typeof state !== "object") return;
    if (!isSocketInRoom(roomId, socket.id)) return;

    // Persist latest media state in memory for late joiners.
    const normalized = {
      mic: !!state.mic,
      cam: !!state.cam,
      screen: !!state.screen,
    };
    let map = roomMediaState.get(roomId);
    if (!map) {
      map = new Map();
      roomMediaState.set(roomId, map);
    }

    const prev = map.get(socket.id) || {
      mic: false,
      cam: false,
      screen: false,
    };
    map.set(socket.id, normalized);

    // Log user media changes into chat as system messages.
    const short = String(socket.id).slice(0, 6);
    const messages = [];
    if (prev.screen !== normalized.screen) {
      messages.push(
        normalized.screen
          ? `🖥 ${short} started screen sharing`
          : `🖥 ${short} stopped screen sharing`
      );
    }
    if (prev.cam !== normalized.cam) {
      messages.push(
        normalized.cam
          ? `📷 ${short} turned webcam on`
          : `📷 ${short} turned webcam off`
      );
    }
    if (prev.mic !== normalized.mic) {
      messages.push(
        normalized.mic
          ? `🎙 ${short} turned mic on`
          : `🎙 ${short} turned mic off`
      );
    }

    for (const text of messages) {
      try {
        const msg = await prisma.roomMessage.create({
          data: {
            roomId,
            senderId: "system",
            text,
          },
        });

        io.to(roomId).emit("chat_message", {
          id: msg.id,
          roomId: msg.roomId,
          senderId: msg.senderId,
          text: msg.text,
          createdAt: msg.createdAt,
        });
      } catch (err) {
        console.error("Failed to persist system chat", err);
      }
    }

    socket.to(roomId).emit("webrtc_media_state", {
      roomId,
      from: socket.id,
      state: normalized,
    });
  });

  socket.on("webrtc_speaking", (data) => {
    const { roomId, speaking } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (typeof speaking !== "boolean") return;
    if (!isSocketInRoom(roomId, socket.id)) return;
    socket.to(roomId).emit("webrtc_speaking", {
      roomId,
      from: socket.id,
      speaking,
    });
  });

  socket.on("request_chat_history", async (rawRoom) => {
    const roomId = normalizeRoomId(rawRoom);
    if (!roomId) return;
    try {
      if (dbConnected && prisma) {
        const recent = await prisma.roomMessage.findMany({
          where: { roomId },
          orderBy: { createdAt: "desc" },
          take: CHAT_HISTORY_LIMIT,
        });

        socket.emit("chat_history", {
          roomId,
          messages: recent.reverse().map((m) => ({
            id: m.id,
            roomId: m.roomId,
            senderId: m.senderId,
            senderUsername: m.senderUsername ?? null,
            text: m.text,
            createdAt: m.createdAt,
          })),
        });
      } else {
        socket.emit("chat_history", { roomId, messages: [] });
      }
    } catch (err) {
      console.error("Failed to load chat history:", err.message);
      socket.emit("chat_history", { roomId, messages: [] });
    }
  });

  async function handleChatSend(data) {
    const { roomId, text } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (typeof text !== "string") return;

    const trimmed = text.trim();
    if (!trimmed) return;
    if (trimmed.length > 2000) return;

    try {
      if (dbConnected && prisma) {
        const senderUsername =
          socket.data?.authUser?.username ||
          socketIdToUsername.get(socket.id) ||
          null;
        const msg = await prisma.roomMessage.create({
          data: {
            roomId,
            senderId: socket.id,
            senderUsername,
            text: trimmed,
          },
        });

        io.to(roomId).emit("chat_message", {
          id: msg.id,
          roomId: msg.roomId,
          senderId: msg.senderId,
          senderUsername: msg.senderUsername ?? senderUsername,
          text: msg.text,
          createdAt: msg.createdAt,
        });
      }
    } catch (err) {
      console.error("Failed to save chat message:", err.message);
    }
  }

  // Web uses send_chat; Android client historically used chat_message for sending.
  socket.on("send_chat", handleChatSend);
  socket.on("chat_message", handleChatSend);

  socket.on("request_room_state", (rawRoom) => {
    const roomId = normalizeRoomId(rawRoom);
    if (!roomId) return;
    const state = roomState.get(roomId);

    // Calculate estimated current timestamp if video is playing
    let estimatedTimestamp = state?.timestamp;
    if (state && state.isPlaying === true) {
      const now = Date.now();
      const prevTimestamp =
        typeof state.timestamp === "number" ? state.timestamp : 0;
      const prevUpdatedAt =
        typeof state.updatedAt === "number" ? state.updatedAt : now;
      const prevSpeed =
        typeof state.playbackSpeed === "number" &&
        Number.isFinite(state.playbackSpeed)
          ? state.playbackSpeed
          : 1;
      estimatedTimestamp =
        prevTimestamp + Math.max(0, (now - prevUpdatedAt) / 1000) * prevSpeed;
    }

    socket.emit("room_state", {
      roomId,
      serverNow: Date.now(), // For clock sync
      ...(state || {}),
      timestamp: estimatedTimestamp,
      // Ensure isPlaying is always defined (default to false if missing)
      isPlaying: state?.isPlaying ?? false,
    });
  });

  socket.on("request_activity_history", async (rawRoom) => {
    const roomId = normalizeRoomId(rawRoom);
    if (!roomId) return;
    await emitActivityHistory(socket, roomId);
  });

  // Handle video sync events
  socket.on("sync_video", async (data) => {
    const roomId = normalizeRoomId(data);
    if (!roomId) return;

    const {
      action,
      timestamp,
      videoUrl,
      volume,
      isMuted,
      playbackSpeed,
      audioSyncEnabled,
    } = data || {};
    // action can be 'play', 'pause', 'seek', 'change_url', 'set_mute', 'set_speed', 'set_volume', 'set_audio_sync'

    console.log(
      `Room ${roomId}: ${action} at ${timestamp} ${videoUrl ? `URL: ${videoUrl}` : ""}`
    );

    // Update room state.
    const prev = roomState.get(roomId) || {};

    const now = Date.now();
    const prevTimestamp =
      typeof prev.timestamp === "number" ? prev.timestamp : 0;
    const prevUpdatedAt =
      typeof prev.updatedAt === "number" ? prev.updatedAt : now;
    const prevSpeed =
      typeof prev.playbackSpeed === "number" &&
      Number.isFinite(prev.playbackSpeed)
        ? prev.playbackSpeed
        : 1;
    const prevIsPlaying = prev.isPlaying === true;
    const estimatedNowTimestamp = prevIsPlaying
      ? prevTimestamp + Math.max(0, (now - prevUpdatedAt) / 1000) * prevSpeed
      : prevTimestamp;

    // GUARD: Reject play/pause events that would regress playback significantly.
    // This prevents new joiners from accidentally resetting the room position
    // if their client sends a play event before receiving room state.
    if (
      (action === "play" || action === "pause") &&
      typeof timestamp === "number"
    ) {
      const regression = estimatedNowTimestamp - timestamp;
      // If this would jump backwards more than 10 seconds, and we're already
      // past 15 seconds in the video, reject it (likely a new joiner's stale event)
      if (regression > 10 && estimatedNowTimestamp > 15) {
        console.log(
          `Room ${roomId}: Rejecting ${action} at ${timestamp} - would regress from ~${estimatedNowTimestamp.toFixed(1)}s`
        );
        return;
      }
    }

    const senderUsername =
      socket.data?.authUser?.username ||
      socketIdToUsername.get(socket.id) ||
      null;

    const shouldAnchorPlaybackPosition =
      action === "play" ||
      action === "pause" ||
      action === "seek" ||
      action === "change_url" ||
      // Speed changes affect extrapolation; anchor to a known timestamp.
      action === "set_speed";

    const hasIncomingTimestamp = typeof timestamp === "number";
    const nextTimestamp = hasIncomingTimestamp
      ? timestamp
      : action === "change_url"
        ? 0
        : shouldAnchorPlaybackPosition
          ? estimatedNowTimestamp
          : prevTimestamp;

    const nextUpdatedAt = shouldAnchorPlaybackPosition
      ? now
      : typeof prev.updatedAt === "number"
        ? prev.updatedAt
        : now;
    const next = {
      ...prev,
      videoUrl: typeof videoUrl === "string" ? videoUrl : prev.videoUrl,
      timestamp: nextTimestamp,
      action: typeof action === "string" ? action : prev.action,
      updatedAt: nextUpdatedAt,
      senderId: socket.id,
      senderUsername,
    };

    if (typeof volume === "number" && Number.isFinite(volume)) {
      next.volume = Math.max(0, Math.min(1, volume));
    }
    if (typeof isMuted === "boolean") {
      next.isMuted = isMuted;
    }
    if (typeof playbackSpeed === "number" && Number.isFinite(playbackSpeed)) {
      next.playbackSpeed = Math.max(0.25, Math.min(2, playbackSpeed));
    }

    if (typeof audioSyncEnabled === "boolean") {
      next.audioSyncEnabled = audioSyncEnabled;
    }

    // Track isPlaying independently so room_state stays accurate even if
    // the last action is seek/mute/speed/volume.
    if (action === "play") next.isPlaying = true;
    if (action === "pause") next.isPlaying = false;
    if (action === "change_url") next.isPlaying = false;

    roomState.set(roomId, next);

    // Persist this event for activity feed/history.
    try {
      await prisma.roomActivity.create({
        data: {
          roomId,
          kind: "sync",
          action: action ?? null,
          timestamp: typeof timestamp === "number" ? timestamp : null,
          videoUrl: typeof videoUrl === "string" ? videoUrl : null,
          senderId: socket.id,
          senderUsername,
        },
      });
    } catch (err) {
      console.error("Failed to persist sync activity", err);
    }

    // Broadcast to everyone else in the room
    socket.to(roomId).emit("receive_sync", {
      action,
      timestamp: next.timestamp,
      videoUrl: next.videoUrl,
      updatedAt: next.updatedAt,
      volume: next.volume,
      isMuted: next.isMuted,
      playbackSpeed: next.playbackSpeed,
      audioSyncEnabled: next.audioSyncEnabled,
      senderId: socket.id,
      senderUsername,
      serverNow: Date.now(), // For clock sync
    });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    const username =
      socket.data?.authUser?.username ||
      socketIdToUsername.get(socket.id) ||
      null;

    // Persist leave events for all rooms this socket joined.
    const rooms = Array.from(joinedRooms);
    if (rooms.length === 0) return;

    // Notify peers for WebRTC cleanup.
    for (const roomId of rooms) {
      // Clean up in-memory media state.
      const map = roomMediaState.get(roomId);
      if (map) {
        map.delete(socket.id);
        if (map.size === 0) roomMediaState.delete(roomId);
      }

      socket.to(roomId).emit("user_left", { socketId: socket.id, username });
      socket.to(roomId).emit("webrtc_speaking", {
        roomId,
        from: socket.id,
        speaking: false,
      });
      socket.to(roomId).emit("webrtc_media_state", {
        roomId,
        from: socket.id,
        state: { mic: false, cam: false, screen: false },
      });

      // Reassign host if needed.
      if (roomHost.get(roomId) === socket.id) {
        const room = io.sockets.adapter.rooms.get(roomId);
        const remaining = room
          ? Array.from(room).filter((id) => id !== socket.id)
          : [];

        if (remaining.length > 0) {
          roomHost.set(roomId, remaining[0]);
          io.to(roomId).emit("room_host", {
            roomId,
            hostId: roomHost.get(roomId),
          });
        } else {
          roomHost.delete(roomId);
          roomBans.delete(roomId);
          roomPasswordHash.delete(roomId);
          roomWheel.delete(roomId);
        }
      }
    }

    (async () => {
      for (const roomId of rooms) {
        try {
          if (dbConnected && prisma) {
            const senderUsername =
              socket.data?.authUser?.username ||
              socketIdToUsername.get(socket.id) ||
              null;
            const evt = await prisma.roomActivity.create({
              data: {
                roomId,
                kind: "leave",
                senderId: socket.id,
                senderUsername,
              },
            });

            // Notify others (optional)
            socket.to(roomId).emit("activity_event", {
              id: evt.id,
              roomId: evt.roomId,
              kind: evt.kind,
              action: evt.action,
              timestamp: evt.timestamp,
              videoUrl: evt.videoUrl,
              senderId: evt.senderId,
              senderUsername: evt.senderUsername ?? senderUsername,
              createdAt: evt.createdAt,
            });
          }
        } catch (err) {
          console.error("Failed to persist leave activity:", err.message);
        }
      }
    })();
  });
});

const PORT = process.env.PORT || 4000;

function getLanIPv4() {
  try {
    const ifaces = os.networkInterfaces();
    for (const list of Object.values(ifaces)) {
      for (const iface of list || []) {
        if (iface && iface.family === "IPv4" && !iface.internal) {
          return iface.address;
        }
      }
    }
  } catch {
    // ignore
  }
  return null;
}

server.listen(PORT, "0.0.0.0", () => {
  const lanIp = getLanIPv4();
  console.log(`✓ Server running on port ${PORT}`);
  console.log(`✓ Server accessible at http://localhost:${PORT}`);
  if (lanIp) {
    console.log(`✓ Server accessible on LAN at http://${lanIp}:${PORT}`);
  }
  console.log(
    `✓ Database status: ${dbConnected ? "Connected" : "Disconnected (running in memory-only mode)"}`
  );
});

process.on("SIGINT", async () => {
  try {
    await prisma.$disconnect();
  } finally {
    process.exit(0);
  }
});
