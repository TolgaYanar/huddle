const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { PrismaClient } = require("@prisma/client");

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

const CHAT_HISTORY_LIMIT = 50;
const ACTIVITY_HISTORY_LIMIT = 100;

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
  socket.on("join_room", async (roomId) => {
    socket.join(roomId);
    joinedRooms.add(roomId);
    console.log(`User ${socket.id} joined room: ${roomId}`);
    // Notify others in the room (optional)
    socket.to(roomId).emit("user_joined", socket.id);

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

  socket.on("request_chat_history", async (roomId) => {
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

  socket.on("request_activity_history", async (roomId) => {
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
