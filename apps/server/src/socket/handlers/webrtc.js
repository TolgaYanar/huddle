const { createSocketRateLimiter } = require("../helpers/socketRateLimit");
const { isSocketIdInRoom } = require("../helpers/membership");

function attachWebRTCHandlers(io, state, socket, deps) {
  // --- WebRTC signaling (socket.io relays between peers) ---
  // Both the caller and the relay target are checked through the shared
  // helper, which rejects a roomId that is really just a socket id.
  const isSocketInRoom = (roomId, socketId) =>
    isSocketIdInRoom(io, roomId, socketId);

  // Speaking events are emitted from voice-activity detection — typically
  // every 50–200ms while talking. Bound to ~20/s to drop pathological floods
  // without affecting normal use.
  const speakingLimiter = createSocketRateLimiter({ windowMs: 1000, max: 20 });
  // ICE candidate gathering normally produces under 50 candidates per peer
  // connection. 200/10s is generous; anything past that is abuse.
  const iceLimiter = createSocketRateLimiter({ windowMs: 10000, max: 200 });
  // Media toggles (mic/cam/screen) are infrequent — a user flips one every few
  // seconds at most. 5/s bounds the DB-write + chat-broadcast amplification
  // (up to 3 roomMessage rows per call) a flood would otherwise cause.
  const mediaStateLimiter = createSocketRateLimiter({ windowMs: 1000, max: 5 });
  // Offer/answer are relayed 1:1 and carry the largest payload in the
  // signaling set. A normal session negotiates a handful of times per peer;
  // 30/10s leaves room for renegotiation storms (mic/cam/screen toggles)
  // while bounding egress amplification.
  const sdpLimiter = createSocketRateLimiter({ windowMs: 10000, max: 30 });
  // Keep only the human-readable audit writes ordered. The latency-sensitive
  // media relay below remains synchronous and never waits for this queue.
  const mediaAuditTails = new Map();

  // socket.io accepts ~1MB per event by default. A session description is a
  // small text blob, so reject anything that is not a plausibly shaped SDP
  // before relaying it to another member.
  const MAX_SDP_LENGTH = 64_000;
  const isValidSdp = (sdp) =>
    !!sdp &&
    typeof sdp === "object" &&
    typeof sdp.type === "string" &&
    sdp.type.length <= 16 &&
    typeof sdp.sdp === "string" &&
    sdp.sdp.length > 0 &&
    sdp.sdp.length <= MAX_SDP_LENGTH;

  // An ICE candidate is a short SDP attribute line plus a little metadata.
  // Without a shape check the relay forwarded any object at 200/10s, so a
  // member could push ~200MB of arbitrary JSON at another member.
  const MAX_CANDIDATE_LENGTH = 1024;
  const validGeneration = (generation) =>
    generation == null ||
    (typeof generation === "string" &&
      generation.length > 0 &&
      generation.length <= 64);
  const isValidIceCandidate = (candidate) => {
    if (!candidate || typeof candidate !== "object") return false;
    // An end-of-candidates signal is an empty candidate string.
    if (typeof candidate.candidate !== "string") return false;
    if (candidate.candidate.length > MAX_CANDIDATE_LENGTH) return false;
    if (
      candidate.sdpMid != null &&
      (typeof candidate.sdpMid !== "string" || candidate.sdpMid.length > 64)
    ) {
      return false;
    }
    if (
      candidate.sdpMLineIndex != null &&
      !Number.isInteger(candidate.sdpMLineIndex)
    ) {
      return false;
    }
    if (
      candidate.usernameFragment != null &&
      (typeof candidate.usernameFragment !== "string" ||
        candidate.usernameFragment.length > 256)
    ) {
      return false;
    }
    return true;
  };

  socket.on("webrtc_offer", (data) => {
    const { roomId, to, sdp } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!to || typeof to !== "string") return;
    if (!isValidSdp(sdp)) return;
    if (sdp.type !== "offer") return;
    if (!validGeneration(sdp.generation)) return;
    if (!isSocketInRoom(roomId, socket.id) || !isSocketInRoom(roomId, to))
      return;
    if (!sdpLimiter()) return;
    io.to(to).emit("webrtc_offer", {
      roomId,
      from: socket.id,
      sdp: {
        type: sdp.type,
        sdp: sdp.sdp,
        ...(sdp.generation ? { generation: sdp.generation } : {}),
      },
    });
  });

  socket.on("webrtc_answer", (data) => {
    const { roomId, to, sdp } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!to || typeof to !== "string") return;
    if (!isValidSdp(sdp)) return;
    if (sdp.type !== "answer") return;
    if (!validGeneration(sdp.generation)) return;
    if (!isSocketInRoom(roomId, socket.id) || !isSocketInRoom(roomId, to))
      return;
    if (!sdpLimiter()) return;
    io.to(to).emit("webrtc_answer", {
      roomId,
      from: socket.id,
      sdp: {
        type: sdp.type,
        sdp: sdp.sdp,
        ...(sdp.generation ? { generation: sdp.generation } : {}),
      },
    });
  });

  socket.on("webrtc_ice", (data) => {
    const { roomId, to, candidate } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!to || typeof to !== "string") return;
    if (!isValidIceCandidate(candidate)) return;
    if (!validGeneration(candidate.generation)) return;
    if (!isSocketInRoom(roomId, socket.id) || !isSocketInRoom(roomId, to))
      return;
    if (!iceLimiter()) return;
    // Relay only the fields the browser needs, so unknown keys on the wire
    // are never forwarded to another member.
    io.to(to).emit("webrtc_ice", {
      roomId,
      from: socket.id,
      candidate: {
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid ?? null,
        sdpMLineIndex: candidate.sdpMLineIndex ?? null,
        usernameFragment: candidate.usernameFragment ?? null,
        ...(candidate.generation ? { generation: candidate.generation } : {}),
      },
    });
  });

  socket.on("webrtc_media_state", async (data) => {
    const { roomId, state: incoming } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (!incoming || typeof incoming !== "object") return;
    if (!isSocketInRoom(roomId, socket.id)) return;
    const normalized = {
      mic: !!incoming.mic,
      cam: !!incoming.cam,
      screen: !!incoming.screen,
    };

    let map = state.roomMediaState.get(roomId);
    if (!map) {
      map = new Map();
      state.roomMediaState.set(roomId, map);
    }

    const prev = map.get(socket.id) || {
      mic: false,
      cam: false,
      screen: false,
    };
    map.set(socket.id, normalized);

    // Signaling state is latency-sensitive and must preserve socket arrival
    // order. Persisting human-readable audit messages can take arbitrarily
    // long (or fail), so never hold the actual media-state broadcast behind
    // those writes.
    socket.to(roomId).emit("webrtc_media_state", {
      roomId,
      from: socket.id,
      state: normalized,
    });

    // Never rate-limit the authoritative state itself. In particular, an OFF
    // event dropped after a burst leaves every listener showing a frozen
    // camera or live microphone indefinitely. Only bound the expensive,
    // human-readable audit amplification below; the latest state always wins.
    if (!mediaStateLimiter()) return;

    // Log user media changes into chat as system messages.
    const short =
      socket.data?.authUser?.username ||
      state.socketIdToUsername.get(socket.id) ||
      String(socket.id).slice(0, 6);
    const messages = [];
    if (prev.screen !== normalized.screen) {
      messages.push(
        normalized.screen
          ? `🖥 ${short} started screen sharing`
          : `🖥 ${short} stopped screen sharing`,
      );
    }
    if (prev.cam !== normalized.cam) {
      messages.push(
        normalized.cam
          ? `📷 ${short} turned webcam on`
          : `📷 ${short} turned webcam off`,
      );
    }
    if (prev.mic !== normalized.mic) {
      messages.push(
        normalized.mic
          ? `🎙 ${short} turned mic on`
          : `🎙 ${short} turned mic off`,
      );
    }

    if (messages.length === 0) return;

    const previousAudit = mediaAuditTails.get(roomId) || Promise.resolve();
    const currentAudit = previousAudit.then(async () => {
      for (const text of messages) {
        try {
          // Original behavior: best-effort persist. If prisma is unavailable this will throw.
          const prisma = deps.getPrisma();
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
    });
    mediaAuditTails.set(roomId, currentAudit);
    try {
      await currentAudit;
    } finally {
      if (mediaAuditTails.get(roomId) === currentAudit) {
        mediaAuditTails.delete(roomId);
      }
    }
  });

  socket.on("webrtc_speaking", (data) => {
    const { roomId, speaking } = data || {};
    if (!roomId || typeof roomId !== "string") return;
    if (typeof speaking !== "boolean") return;
    if (!isSocketInRoom(roomId, socket.id)) return;
    if (!speakingLimiter()) return;
    socket.to(roomId).emit("webrtc_speaking", {
      roomId,
      from: socket.id,
      speaking,
    });
  });
}

module.exports = {
  attachWebRTCHandlers,
};
