const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");

require("dotenv").config();

const app = express();
app.use(cors());

const prisma = new PrismaClient();

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for now (web + mobile)
    methods: ["GET", "POST"],
  },
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
        createdAt: e.createdAt,
      })),
    });
  } catch (err) {
    console.error("Failed to load activity history", err);
    socket.emit("activity_history", { roomId, events: [] });
  }
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

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
          mediaStates,
          hostId: roomHost.get(roomId),
        });

        socket.emit("room_password_status", {
          roomId,
          hasPassword: roomPasswordHash.has(roomId),
        });

        emitWheelStateTo(socket, roomId);
      } catch (err) {
        console.error("Failed to re-emit room snapshot", err);
      }
      return;
    }

    socket.join(roomId);
    joinedRooms.add(roomId);
    console.log(`User ${socket.id} joined room: ${roomId}`);
    // Notify others in the room (optional)
    socket.to(roomId).emit("user_joined", socket.id);

    // Provide the joiner a list of current users so they can establish WebRTC.
    try {
      const room = io.sockets.adapter.rooms.get(roomId);
      const users = room
        ? Array.from(room).filter((id) => id !== socket.id)
        : [];

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
        mediaStates,
        hostId: roomHost.get(roomId),
      });

      socket.emit("room_password_status", {
        roomId,
        hasPassword: roomPasswordHash.has(roomId),
      });

      emitWheelStateTo(socket, roomId);
    } catch (err) {
      console.error("Failed to emit room_users", err);
      socket.emit("room_users", {
        roomId,
        users: [],
        mediaStates: {},
        hostId: roomHost.get(roomId) || null,
      });

      socket.emit("room_password_status", {
        roomId,
        hasPassword: roomPasswordHash.has(roomId),
      });

      emitWheelStateTo(socket, roomId);
    }

    // Persist join as an activity event (optional but useful for moderation/audit).
    try {
      const evt = await prisma.roomActivity.create({
        data: {
          roomId,
          kind: "join",
          senderId: socket.id,
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
        createdAt: evt.createdAt,
      });
    } catch (err) {
      console.error("Failed to persist join activity", err);
    }

    // Send current room state to this new joiner.
    const state = roomState.get(roomId);
    socket.emit("room_state", {
      roomId,
      ...(state || {}),
    });

    // Send recent chat history for this room.
    try {
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
          text: m.text,
          createdAt: m.createdAt,
        })),
      });
    } catch (err) {
      console.error("Failed to load chat history", err);
      socket.emit("chat_history", { roomId, messages: [] });
    }

    await emitActivityHistory(socket, roomId);
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
      const evt = await prisma.roomActivity.create({
        data: {
          roomId,
          kind: "password",
          senderId: socket.id,
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
        createdAt: evt.createdAt,
      });
    } catch (err) {
      console.error("Failed to persist password activity", err);
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
      const evt = await prisma.roomActivity.create({
        data: {
          roomId,
          kind: "kick",
          senderId: socket.id,
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
        createdAt: evt.createdAt,
      });
    } catch (err) {
      console.error("Failed to persist kick activity", err);
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
          text: m.text,
          createdAt: m.createdAt,
        })),
      });
    } catch (err) {
      console.error("Failed to load chat history", err);
      socket.emit("chat_history", { roomId, messages: [] });
    }
  });

  socket.on("send_chat", async (data) => {
    const { roomId, text } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (typeof text !== "string") return;

    const trimmed = text.trim();
    if (!trimmed) return;
    if (trimmed.length > 2000) return;

    try {
      const msg = await prisma.roomMessage.create({
        data: {
          roomId,
          senderId: socket.id,
          text: trimmed,
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
      console.error("Failed to save chat message", err);
    }
  });

  socket.on("request_room_state", (roomId) => {
    const state = roomState.get(roomId);
    socket.emit("room_state", {
      roomId,
      ...(state || {}),
    });
  });

  socket.on("request_activity_history", async (rawRoom) => {
    const roomId = normalizeRoomId(rawRoom);
    if (!roomId) return;
    await emitActivityHistory(socket, roomId);
  });

  // Handle video sync events
  socket.on("sync_video", async (data) => {
    const { roomId, action, timestamp, videoUrl } = data;
    // action can be 'play', 'pause', 'seek', 'change_url'

    console.log(
      `Room ${roomId}: ${action} at ${timestamp} ${videoUrl ? `URL: ${videoUrl}` : ""}`
    );

    // Update room state.
    const prev = roomState.get(roomId) || {};
    roomState.set(roomId, {
      videoUrl: videoUrl ?? prev.videoUrl,
      timestamp: typeof timestamp === "number" ? timestamp : prev.timestamp,
      action: action ?? prev.action,
      updatedAt: Date.now(),
    });

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
        },
      });
    } catch (err) {
      console.error("Failed to persist sync activity", err);
    }

    // Broadcast to everyone else in the room
    socket.to(roomId).emit("receive_sync", {
      action,
      timestamp,
      videoUrl,
      senderId: socket.id,
    });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

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

      socket.to(roomId).emit("user_left", socket.id);
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
          const evt = await prisma.roomActivity.create({
            data: {
              roomId,
              kind: "leave",
              senderId: socket.id,
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
            createdAt: evt.createdAt,
          });
        } catch (err) {
          console.error("Failed to persist leave activity", err);
        }
      }
    })();
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

process.on("SIGINT", async () => {
  try {
    await prisma.$disconnect();
  } finally {
    process.exit(0);
  }
});
