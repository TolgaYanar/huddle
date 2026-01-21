function attachWebRTCHandlers(io, state, socket, deps) {
  // --- WebRTC signaling (socket.io relays between peers) ---
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

    // Log user media changes into chat as system messages.
    const short = String(socket.id).slice(0, 6);
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
}

module.exports = {
  attachWebRTCHandlers,
};
