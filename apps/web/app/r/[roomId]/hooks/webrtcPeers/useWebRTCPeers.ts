"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  ICE_RETRY_MS,
  fetchIceConfig,
  hasTurnServer,
  iceServerConfigurationsMatch,
  parseIceServers,
  refreshDelayMs,
} from "./iceServers";
import { PeerNegotiator } from "./negotiation";
import { syncTracksToPeer as syncTracksToPeerImpl } from "./syncTracks";
import type {
  PeerConnectionStatus,
  UseWebRTCPeersArgs,
  WebRTCPeersLatest,
} from "./types";
import { useWebRTCPeerSubscriptions } from "./useWebRTCPeerSubscriptions";

export const PEER_DISCONNECTED_GRACE_MS = 5_000;
export const PEER_CONNECTION_TIMEOUT_MS = 15_000;
export const PEER_RECOVERY_DELAYS_MS = [0, 500, 1_500] as const;

export function useWebRTCPeers<MediaState>(
  args: UseWebRTCPeersArgs<MediaState>,
) {
  const {
    isConnected,
    userId,
    roomId,
    iceAccessToken,

    ensureLocalStream,

    peersRef,
    remoteStreamsRef,
    setRemoteStreams,
    setRemoteMedia,
    setRemoteSpeaking,

    sendWebRTCIce,
    sendWebRTCOffer,
    sendWebRTCAnswer,

    onRoomUsers,
    onUserJoined,
    onUserLeft,

    onWebRTCOffer,
    onWebRTCAnswer,
    onWebRTCIce,

    onWebRTCMediaState,
    onWebRTCSpeaking,
  } = args;

  const negotiatorsRef = useRef<Map<string, PeerNegotiator>>(new Map());
  const [peerConnectionStates, setPeerConnectionStates] = useState<
    Record<string, PeerConnectionStatus>
  >({});
  const activePeerIdsRef = useRef<Set<string>>(new Set());
  const recoveryAttemptsRef = useRef<Map<string, number>>(new Map());
  const recoveryTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const disconnectedTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  const connectionTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  const isConnectedRef = useRef(isConnected);
  const handleConnectionStateRef = useRef<
    (peerId: string, pc: RTCPeerConnection) => void
  >(() => {});
  const schedulePeerRecoveryRef = useRef<
    (peerId: string, pc: RTCPeerConnection, force?: boolean) => void
  >(() => {});
  const configureExistingPeersRef = useRef<
    (iceServers: RTCIceServer[], restartIce: boolean) => void
  >(() => {});
  isConnectedRef.current = isConnected;

  const setPeerConnectionStatus = useCallback(
    (peerId: string, status: PeerConnectionStatus | null) => {
      setPeerConnectionStates((previous) => {
        if (status && previous[peerId] === status) return previous;
        if (!status && !(peerId in previous)) return previous;
        const next = { ...previous };
        if (status) next[peerId] = status;
        else delete next[peerId];
        return next;
      });
    },
    [],
  );

  const clearPeerTimer = useCallback(
    (timers: Map<string, ReturnType<typeof setTimeout>>, peerId: string) => {
      const timer = timers.get(peerId);
      if (timer) clearTimeout(timer);
      timers.delete(peerId);
    },
    [],
  );

  const cancelPeerRecovery = useCallback(
    (peerId: string, resetAttempts = true) => {
      clearPeerTimer(recoveryTimersRef.current, peerId);
      clearPeerTimer(disconnectedTimersRef.current, peerId);
      clearPeerTimer(connectionTimersRef.current, peerId);
      if (resetAttempts) recoveryAttemptsRef.current.delete(peerId);
    },
    [clearPeerTimer],
  );

  const replaceActivePeerIds = useCallback(
    (peerIds: Iterable<string>) => {
      const next = new Set(peerIds);
      for (const peerId of activePeerIdsRef.current) {
        if (!next.has(peerId)) cancelPeerRecovery(peerId);
      }
      activePeerIdsRef.current.clear();
      for (const peerId of next) activePeerIdsRef.current.add(peerId);
    },
    [cancelPeerRecovery],
  );

  const markPeerActive = useCallback((peerId: string) => {
    activePeerIdsRef.current.add(peerId);
  }, []);

  const markPeerInactive = useCallback(
    (peerId: string) => {
      activePeerIdsRef.current.delete(peerId);
      cancelPeerRecovery(peerId);
    },
    [cancelPeerRecovery],
  );

  const isPeerActive = useCallback(
    (peerId: string) => activePeerIdsRef.current.has(peerId),
    [],
  );

  // ICE servers for every new RTCPeerConnection. Starts from the static
  // fallback and is replaced by whatever the server issues. When a retry
  // upgrades a live room from STUN-only to TURN — or expiring credentials
  // rotate — existing peers are updated and ICE-restarted as well; otherwise
  // those calls stay on the degraded or expired configuration they started
  // with.
  const iceServersRef = useRef<RTCIceServer[]>(
    parseIceServers(process.env.NEXT_PUBLIC_ICE_SERVERS),
  );
  const iceGateRef = useRef(createIceGate());
  const identityRef = useRef(userId);
  const signalingRef = useRef({ sendWebRTCOffer, sendWebRTCAnswer });
  identityRef.current = userId;
  signalingRef.current = { sendWebRTCOffer, sendWebRTCAnswer };

  const latestRef = useRef<WebRTCPeersLatest<MediaState>>({
    roomId,
    userId,
    iceReady: iceGateRef.current.promise,
    createPeerConnection: null as unknown as (
      peerId: string,
    ) => RTCPeerConnection,
    getPeerIds: null as unknown as () => string[],
    getExistingPeer: null as unknown as (
      peerId: string,
    ) => RTCPeerConnection | undefined,
    getExistingNegotiator: null as unknown as (
      peerId: string,
    ) => PeerNegotiator | undefined,
    getPeerNegotiator: null as unknown as (peerId: string) => PeerNegotiator,
    sendOfferToPeer: null as unknown as (peerId: string) => Promise<void>,
    recoverPeer: (peerId, pc) =>
      schedulePeerRecoveryRef.current(peerId, pc, true),
    closePeer: null as unknown as (peerId: string) => void,
    syncTracksToPeer: null as unknown as (
      peerId: string,
      pc: RTCPeerConnection,
    ) => Promise<void>,
    replaceActivePeerIds,
    markPeerActive,
    markPeerInactive,
    isPeerActive,
    sendWebRTCAnswer: null as unknown as (
      to: string,
      sdp: RTCSessionDescriptionInit | null,
    ) => void,
    setRemoteMedia: null as unknown as React.Dispatch<
      React.SetStateAction<Record<string, MediaState>>
    >,
    setRemoteSpeaking: null as unknown as React.Dispatch<
      React.SetStateAction<Record<string, boolean>>
    >,

    onRoomUsers,
    onUserJoined,
    onUserLeft,

    onWebRTCOffer,
    onWebRTCAnswer,
    onWebRTCIce,

    onWebRTCMediaState,
    onWebRTCSpeaking,
  });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const load = async () => {
      const config = await fetchIceConfig({
        iceAccess:
          iceAccessToken && userId
            ? { roomId, socketId: userId, token: iceAccessToken }
            : undefined,
      });
      if (cancelled) return;
      if (config) {
        const previousIceServers = iceServersRef.current;
        const iceConfigurationChanged = !iceServerConfigurationsMatch(
          previousIceServers,
          config.iceServers,
        );
        const restartExistingPeers =
          hasTurnServer(config.iceServers) && iceConfigurationChanged;
        iceServersRef.current = config.iceServers;
        if (iceConfigurationChanged) {
          configureExistingPeersRef.current(
            config.iceServers,
            restartExistingPeers,
          );
        }
        if (config.ttlSeconds !== null) {
          timer = setTimeout(load, refreshDelayMs(config.ttlSeconds));
        }
      } else {
        timer = setTimeout(load, ICE_RETRY_MS);
      }
      // Open the gate on the first settled attempt either way: a room with
      // STUN only is degraded, a room that never creates peers is broken.
      iceGateRef.current.open();
    };

    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [iceAccessToken, roomId, userId]);

  const updateRemoteStreamsState = useCallback(() => {
    setRemoteStreams(
      Array.from(remoteStreamsRef.current.entries()).map(([id, stream]) => ({
        id,
        stream,
      })),
    );
  }, [remoteStreamsRef, setRemoteStreams]);

  const disposePeer = useCallback(
    (
      peerId: string,
      options: {
        expectedPeer?: RTCPeerConnection;
        preserveRemoteState?: boolean;
      } = {},
    ) => {
      const pc = peersRef.current.get(peerId);
      if (options.expectedPeer && pc !== options.expectedPeer) return false;
      if (pc) {
        try {
          pc.onicecandidate = null;
          pc.ontrack = null;
          pc.onsignalingstatechange = null;
          pc.onconnectionstatechange = null;
          pc.close();
        } catch {
          // ignore
        }
      }
      peersRef.current.delete(peerId);
      negotiatorsRef.current.delete(peerId);
      remoteStreamsRef.current.delete(peerId);

      if (!options.preserveRemoteState) {
        setPeerConnectionStatus(peerId, null);
        setRemoteMedia((prev) => {
          const next = { ...prev };
          delete next[peerId];
          return next;
        });

        setRemoteSpeaking((prev) => {
          const next = { ...prev };
          delete next[peerId];
          return next;
        });
      }

      updateRemoteStreamsState();
      return true;
    },
    [
      peersRef,
      remoteStreamsRef,
      setRemoteMedia,
      setRemoteSpeaking,
      setPeerConnectionStatus,
      updateRemoteStreamsState,
    ],
  );

  const closePeer = useCallback(
    (peerId: string) => {
      cancelPeerRecovery(peerId);
      disposePeer(peerId);
    },
    [cancelPeerRecovery, disposePeer],
  );

  const syncTracksToPeer = useCallback(
    async (_peerId: string, pc: RTCPeerConnection) => {
      await syncTracksToPeerImpl(ensureLocalStream, pc);
    },
    [ensureLocalStream],
  );

  const createPeerConnection = useCallback(
    (peerId: string) => {
      const existing = peersRef.current.get(peerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
      peersRef.current.set(peerId, pc);
      setPeerConnectionStatus(peerId, "connecting");

      const negotiator = new PeerNegotiator({
        pc,
        isPolite: () => identityRef.current > peerId,
        syncTracks: () => syncTracksToPeer(peerId, pc),
        sendOffer: (description) =>
          signalingRef.current.sendWebRTCOffer(peerId, description),
        sendAnswer: (description) =>
          signalingRef.current.sendWebRTCAnswer(peerId, description),
      });
      negotiatorsRef.current.set(peerId, negotiator);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const raw =
            typeof event.candidate.toJSON === "function"
              ? event.candidate.toJSON()
              : event.candidate;
          const candidate: RTCIceCandidateInit = {
            candidate: raw.candidate ?? event.candidate.candidate,
            sdpMid: raw.sdpMid ?? event.candidate.sdpMid,
            sdpMLineIndex: raw.sdpMLineIndex ?? event.candidate.sdpMLineIndex,
            usernameFragment:
              raw.usernameFragment ?? event.candidate.usernameFragment,
          };
          const generation = negotiator.getGenerationForIceCandidate(candidate);
          sendWebRTCIce(peerId, {
            ...candidate,
            ...(generation ? { generation } : {}),
          } as RTCIceCandidateInit);
        }
      };

      pc.ontrack = (event) => {
        const stream =
          event.streams?.[0] ??
          remoteStreamsRef.current.get(peerId) ??
          new MediaStream();

        // Some browsers may not include streams[0], so ensure track is added.
        if (!stream.getTracks().some((t) => t.id === event.track.id)) {
          try {
            stream.addTrack(event.track);
          } catch {
            // ignore
          }
        }

        remoteStreamsRef.current.set(peerId, stream);
        updateRemoteStreamsState();
      };

      pc.onsignalingstatechange = () => {
        // A renegotiation requested while this peer was mid-exchange is held
        // in the negotiator. Without this trigger it only drained when another
        // description happened to arrive, so a mic/camera toggle made during
        // an in-flight offer could be dropped for the rest of the session.
        if (pc.signalingState !== "stable") return;
        void negotiatorsRef.current.get(peerId)?.flushPendingOffer();
      };

      pc.onconnectionstatechange = () => {
        handleConnectionStateRef.current(peerId, pc);
      };

      // A lost SDP message can leave a browser in `new`/`connecting` without
      // ever firing a failure event. Bound that silent setup state and start a
      // fresh signaling transaction if it never reaches connected.
      const connectionTimer = setTimeout(() => {
        connectionTimersRef.current.delete(peerId);
        if (peersRef.current.get(peerId) !== pc) return;
        if (!activePeerIdsRef.current.has(peerId)) return;
        if (
          pc.connectionState === "connected" ||
          pc.connectionState === "closed"
        ) {
          return;
        }
        schedulePeerRecoveryRef.current(peerId, pc, true);
      }, PEER_CONNECTION_TIMEOUT_MS);
      connectionTimersRef.current.set(peerId, connectionTimer);

      void syncTracksToPeer(peerId, pc).catch(() => {
        schedulePeerRecoveryRef.current(peerId, pc, true);
      });
      return pc;
    },
    [
      peersRef,
      remoteStreamsRef,
      sendWebRTCIce,
      setPeerConnectionStatus,
      syncTracksToPeer,
      updateRemoteStreamsState,
    ],
  );

  const getPeerIds = useCallback(
    () => Array.from(peersRef.current.keys()),
    [peersRef],
  );

  // Lookups that never create. The ICE path must use these: reconcileRoomUsers
  // and user_left close departed peers, and a straggling candidate arriving
  // afterwards used to re-create a peer entry that is never negotiated and
  // never closed (connectionState stays "new", so onconnectionstatechange
  // never fires to clean it up).
  const getExistingPeer = useCallback(
    (peerId: string) => peersRef.current.get(peerId),
    [peersRef],
  );

  const getExistingNegotiator = useCallback(
    (peerId: string) => negotiatorsRef.current.get(peerId),
    [],
  );

  const getPeerNegotiator = useCallback(
    (peerId: string) => {
      createPeerConnection(peerId);
      const negotiator = negotiatorsRef.current.get(peerId);
      if (!negotiator) {
        throw new Error(`Missing WebRTC negotiator for peer ${peerId}`);
      }
      return negotiator;
    },
    [createPeerConnection],
  );

  const sendOfferToPeer = useCallback(
    async (peerId: string) => {
      await getPeerNegotiator(peerId).requestOffer();
    },
    [getPeerNegotiator],
  );

  const schedulePeerRecovery = useCallback(
    (peerId: string, failedPeer: RTCPeerConnection, force = false) => {
      if (!isConnectedRef.current) return;
      if (!activePeerIdsRef.current.has(peerId)) return;
      if (peersRef.current.get(peerId) !== failedPeer) return;
      clearPeerTimer(connectionTimersRef.current, peerId);
      if (!force && failedPeer.connectionState === "connected") {
        cancelPeerRecovery(peerId);
        return;
      }
      if (recoveryTimersRef.current.has(peerId)) return;

      const attempt = recoveryAttemptsRef.current.get(peerId) ?? 0;
      const delay = PEER_RECOVERY_DELAYS_MS[attempt];
      if (delay === undefined) {
        // Stop the loop after a small bounded number of fresh connections.
        // A later authoritative room snapshot or user action can still start
        // a new negotiation, but a permanently broken network cannot spin.
        disposePeer(peerId, {
          expectedPeer: failedPeer,
          preserveRemoteState: true,
        });
        setPeerConnectionStatus(peerId, "failed");
        return;
      }

      setPeerConnectionStatus(peerId, "recovering");

      const timer = setTimeout(() => {
        recoveryTimersRef.current.delete(peerId);
        if (!isConnectedRef.current) return;
        if (!activePeerIdsRef.current.has(peerId)) return;
        if (peersRef.current.get(peerId) !== failedPeer) return;
        if (!force && failedPeer.connectionState === "connected") {
          cancelPeerRecovery(peerId);
          return;
        }

        recoveryAttemptsRef.current.set(peerId, attempt + 1);
        const disposed = disposePeer(peerId, {
          expectedPeer: failedPeer,
          preserveRemoteState: true,
        });
        if (!disposed) return;

        const replacement = createPeerConnection(peerId);
        setPeerConnectionStatus(peerId, "recovering");
        void sendOfferToPeer(peerId).catch(() => {
          schedulePeerRecoveryRef.current(peerId, replacement, true);
        });
      }, delay);
      recoveryTimersRef.current.set(peerId, timer);
    },
    [
      cancelPeerRecovery,
      clearPeerTimer,
      createPeerConnection,
      disposePeer,
      peersRef,
      sendOfferToPeer,
      setPeerConnectionStatus,
    ],
  );
  schedulePeerRecoveryRef.current = schedulePeerRecovery;

  handleConnectionStateRef.current = (peerId, pc) => {
    if (peersRef.current.get(peerId) !== pc) return;
    const state = pc.connectionState;
    if (state === "connected") {
      cancelPeerRecovery(peerId);
      setPeerConnectionStatus(peerId, "connected");
      return;
    }

    if (state === "failed" || state === "closed") {
      clearPeerTimer(connectionTimersRef.current, peerId);
      clearPeerTimer(disconnectedTimersRef.current, peerId);
      schedulePeerRecovery(peerId, pc);
      return;
    }

    if (
      state === "disconnected" &&
      !disconnectedTimersRef.current.has(peerId)
    ) {
      clearPeerTimer(connectionTimersRef.current, peerId);
      setPeerConnectionStatus(peerId, "recovering");
      const timer = setTimeout(() => {
        disconnectedTimersRef.current.delete(peerId);
        // `disconnected -> connecting` is a legal ICE-restart transition. It
        // is not recovery yet: if that attempt stalls, browsers need not emit
        // `failed` promptly (or at all). Keep the original bounded watchdog
        // for every state that is neither healthy nor deliberately closed.
        if (
          pc.connectionState !== "connected" &&
          pc.connectionState !== "closed"
        ) {
          schedulePeerRecoveryRef.current(peerId, pc);
        }
      }, PEER_DISCONNECTED_GRACE_MS);
      disconnectedTimersRef.current.set(peerId, timer);
    }
  };

  const configureExistingPeers = useCallback(
    (nextIceServers: RTCIceServer[], restartIce: boolean) => {
      for (const [peerId, pc] of peersRef.current) {
        if (pc.connectionState === "closed") continue;
        try {
          pc.setConfiguration({ iceServers: nextIceServers });
          // Never create an offer while Socket.IO is down: sendWebRTCOffer is
          // intentionally a no-op then, which would strand the PC in
          // have-local-offer. The reconnect path renegotiates existing peers
          // with this updated configuration.
          if (!restartIce || !isConnectedRef.current) continue;
          // A successful ICE restart is allowed to keep connectionState at
          // `connected` throughout. Do not show a permanent "Restoring"
          // notice merely because credentials rotated; the state-change
          // handler will surface recovery if the transport actually drops.
          pc.restartIce();
          void sendOfferToPeer(peerId).catch(() => {
            schedulePeerRecoveryRef.current(peerId, pc, true);
          });
        } catch {
          // Older engines and already-invalid connections can reject an
          // in-place update. Rebuilding is safer than leaving that peer on a
          // STUN-only configuration after TURN has become available.
          if (restartIce) schedulePeerRecoveryRef.current(peerId, pc, true);
        }
      }
    },
    [peersRef, sendOfferToPeer],
  );
  configureExistingPeersRef.current = configureExistingPeers;

  const renegotiateAllPeers = useCallback(async () => {
    // Presence, not the current map, is authoritative. A peer whose bounded
    // recovery was exhausted has no PC in the map; turning on a real media
    // track should still create a fresh connection instead of forcing the
    // user to discover and press Retry first.
    const ids = Array.from(activePeerIdsRef.current);
    for (const peerId of ids) {
      try {
        await sendOfferToPeer(peerId);
      } catch {
        // ignore
      }
    }
  }, [sendOfferToPeer]);

  const retryFailedPeers = useCallback(async () => {
    const failedPeerIds = Object.entries(peerConnectionStates)
      .filter(
        ([peerId, status]) =>
          status === "failed" && activePeerIdsRef.current.has(peerId),
      )
      .map(([peerId]) => peerId);

    for (const peerId of failedPeerIds) {
      cancelPeerRecovery(peerId);
      const existing = peersRef.current.get(peerId);
      if (existing) {
        disposePeer(peerId, {
          expectedPeer: existing,
          preserveRemoteState: true,
        });
      }
      const replacement = createPeerConnection(peerId);
      setPeerConnectionStatus(peerId, "recovering");
      try {
        await sendOfferToPeer(peerId);
      } catch {
        schedulePeerRecoveryRef.current(peerId, replacement, true);
      }
    }
  }, [
    cancelPeerRecovery,
    createPeerConnection,
    disposePeer,
    peerConnectionStates,
    peersRef,
    sendOfferToPeer,
    setPeerConnectionStatus,
  ]);

  const closeAllPeers = useCallback(() => {
    replaceActivePeerIds([]);
    const ids = Array.from(peersRef.current.keys());
    for (const peerId of ids) {
      closePeer(peerId);
    }
  }, [closePeer, peersRef, replaceActivePeerIds]);

  useEffect(() => {
    const recoveryTimers = recoveryTimersRef.current;
    const disconnectedTimers = disconnectedTimersRef.current;
    const connectionTimers = connectionTimersRef.current;
    const recoveryAttempts = recoveryAttemptsRef.current;
    const activePeerIds = activePeerIdsRef.current;
    return () => {
      for (const timer of recoveryTimers.values()) {
        clearTimeout(timer);
      }
      for (const timer of disconnectedTimers.values()) {
        clearTimeout(timer);
      }
      for (const timer of connectionTimers.values()) {
        clearTimeout(timer);
      }
      recoveryTimers.clear();
      disconnectedTimers.clear();
      connectionTimers.clear();
      recoveryAttempts.clear();
      activePeerIds.clear();
    };
  }, []);

  // Keep the latest values in a ref so our subscription effect doesn't
  // need to re-run when callbacks change (which can cause update loops).
  useEffect(() => {
    latestRef.current.roomId = roomId;
    latestRef.current.userId = userId;

    latestRef.current.createPeerConnection = createPeerConnection;
    latestRef.current.getPeerIds = getPeerIds;
    latestRef.current.getExistingPeer = getExistingPeer;
    latestRef.current.getExistingNegotiator = getExistingNegotiator;
    latestRef.current.getPeerNegotiator = getPeerNegotiator;
    latestRef.current.sendOfferToPeer = sendOfferToPeer;
    latestRef.current.closePeer = closePeer;
    latestRef.current.syncTracksToPeer = syncTracksToPeer;
    latestRef.current.replaceActivePeerIds = replaceActivePeerIds;
    latestRef.current.markPeerActive = markPeerActive;
    latestRef.current.markPeerInactive = markPeerInactive;
    latestRef.current.isPeerActive = isPeerActive;
    latestRef.current.sendWebRTCAnswer = sendWebRTCAnswer;
    latestRef.current.setRemoteMedia = setRemoteMedia;
    latestRef.current.setRemoteSpeaking = setRemoteSpeaking;

    latestRef.current.onRoomUsers = onRoomUsers;
    latestRef.current.onUserJoined = onUserJoined;
    latestRef.current.onUserLeft = onUserLeft;

    latestRef.current.onWebRTCOffer = onWebRTCOffer;
    latestRef.current.onWebRTCAnswer = onWebRTCAnswer;
    latestRef.current.onWebRTCIce = onWebRTCIce;

    latestRef.current.onWebRTCMediaState = onWebRTCMediaState;
    latestRef.current.onWebRTCSpeaking = onWebRTCSpeaking;
  }, [
    roomId,
    userId,
    createPeerConnection,
    getPeerIds,
    getExistingPeer,
    getExistingNegotiator,
    getPeerNegotiator,
    sendOfferToPeer,
    closePeer,
    syncTracksToPeer,
    replaceActivePeerIds,
    markPeerActive,
    markPeerInactive,
    isPeerActive,
    sendWebRTCAnswer,
    setRemoteMedia,
    setRemoteSpeaking,
    onRoomUsers,
    onUserJoined,
    onUserLeft,
    onWebRTCOffer,
    onWebRTCAnswer,
    onWebRTCIce,
    onWebRTCMediaState,
    onWebRTCSpeaking,
  ]);

  useWebRTCPeerSubscriptions({
    isConnected,
    userId,
    roomId,
    latestRef,
  });

  return {
    closePeer,
    closeAllPeers,
    renegotiateAllPeers,
    retryFailedPeers,
    peerConnectionStates,
  };
}

function createIceGate() {
  let open: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}
