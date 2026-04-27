"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  CreateCupGameOptions,
  CupGameCardKind,
  CupGameData,
  CupGamePlayer,
  CupGameResolvePayload,
  CupGameStateData,
} from "shared-logic";

import { Cup, type CupRole } from "./Cup";
import { playSound, isSoundMuted, setSoundMuted } from "./sounds";
import "./animations.css";

export interface CupGamePanelProps {
  cupGameState: CupGameStateData;
  mySocketId: string;
  isRoomHost: boolean;
  createCupGame: (options?: CreateCupGameOptions) => void;
  updateCupGameConfig: (gameId: string, options: CreateCupGameOptions) => void;
  startCupGamePlacement: (gameId: string) => void;
  toggleCupGameSpider: (gameId: string, cupIndex: number) => void;
  lockCupGamePlacement: (gameId: string) => void;
  unlockCupGamePlacement: (gameId: string) => void;
  flipCup: (gameId: string, cupIndex: number) => void;
  drawCupGameCard: (gameId: string) => void;
  resolveCupGameCard: (gameId: string, payload: CupGameResolvePayload) => void;
  cancelCupGameCard: (gameId: string) => void;
  resetCupGame: (gameId: string) => void;
}

const CARD_META: Record<
  CupGameCardKind,
  { emoji: string; label: string; blurb: string; category: "good" | "bad" }
> = {
  flipPlusOne: { emoji: "🔁", label: "Flip +1", blurb: "Flip another cup right now.", category: "bad" },
  flipPlusTwo: { emoji: "💥", label: "Flip +2", blurb: "Flip two more cups in a row.", category: "bad" },
  flipRow: { emoji: "➡️", label: "Flip Row", blurb: "Reveal an entire row.", category: "bad" },
  flipBlock: { emoji: "🟦", label: "Flip 2×2", blurb: "Reveal a 2×2 block.", category: "bad" },
  skipYourTurn: { emoji: "💤", label: "Skip Your Turn", blurb: "Your next turn vanishes.", category: "bad" },
  forceFlip: { emoji: "👉", label: "Force Flip", blurb: "Pick a player + cup. They flip it.", category: "good" },
  stealTurn: { emoji: "😴", label: "Steal a Turn", blurb: "Pick a player. Their next turn is skipped.", category: "good" },
  peek: { emoji: "👁️", label: "Peek", blurb: "Secretly look under one cup.", category: "good" },
  relocate: { emoji: "🔄", label: "Relocate", blurb: "Move one of your spiders to a new empty cup.", category: "good" },
  shield: { emoji: "🛡️", label: "Shield", blurb: "Your next hit is ignored.", category: "good" },
};

type PeekResult = { cupIndex: number; revealedAs: "empty" | "spider"; ownerSocketId: string | null };

export function CupGamePanel(props: CupGamePanelProps) {
  const { cupGameState } = props;

  // Show the most recent active game if any; otherwise the most recent game.
  const game = useMemo(() => {
    const games = cupGameState.games || [];
    if (games.length === 0) return null;
    const live = games.find((g) => g.session.status !== "finished");
    return live || games[games.length - 1] || null;
  }, [cupGameState.games]);

  if (!game) return <CupGameLobby {...props} />;
  return <CupGameInner key={game.gameId} game={game} {...props} />;
}

function CupGameInner(props: CupGamePanelProps & { game: CupGameData; mySocketId: string }) {
  const { game, mySocketId } = props;
  const { status } = game.session;

  // ── Local UI state for animations + peek result ───────────────────────────
  const [recentFlippedCup, setRecentFlippedCup] = useState<number | null>(null);
  const [hitFlippedCup, setHitFlippedCup] = useState<number | null>(null);
  const [shieldedFlippedCup, setShieldedFlippedCup] = useState<number | null>(null);
  const [panelShakeKey, setPanelShakeKey] = useState(0);
  const [heartPopOnSocket, setHeartPopOnSocket] = useState<string | null>(null);
  const [drawnCard, setDrawnCard] = useState<{ kind: CupGameCardKind; category: "good" | "bad"; key: number } | null>(null);
  const [peekResult, setPeekResult] = useState<PeekResult | null>(null);
  const [muted, setMutedState] = useState(isSoundMuted());

  // ── Effect playback driven by `lastEvent` ────────────────────────────────
  const lastSeqRef = useRef(0);
  useEffect(() => {
    const evt = game.session.lastEvent;
    const seq = game.session.effectSeq || 0;
    if (!evt || seq <= lastSeqRef.current) return;
    lastSeqRef.current = seq;
    switch (evt.kind) {
      case "flip": {
        playSound("cupFlip");
        if (evt.revealedAs === "spider") {
          setTimeout(() => playSound("spider"), 70);
          if (evt.shielded) {
            setShieldedFlippedCup(evt.cupIndex);
            setTimeout(() => setShieldedFlippedCup(null), 700);
            setTimeout(() => playSound("shielded"), 110);
          } else if (evt.hit) {
            setHitFlippedCup(evt.cupIndex);
            setTimeout(() => setHitFlippedCup(null), 480);
            setTimeout(() => playSound("hurt"), 220);
            if (evt.flipperSocketId === mySocketId) {
              setPanelShakeKey((k) => k + 1);
            }
            setHeartPopOnSocket(evt.flipperSocketId);
            setTimeout(() => setHeartPopOnSocket(null), 720);
          }
        }
        setRecentFlippedCup(evt.cupIndex);
        setTimeout(() => setRecentFlippedCup(null), 420);
        break;
      }
      case "draw": {
        playSound("draw");
        setDrawnCard({ kind: evt.cardKind, category: evt.category, key: seq });
        setTimeout(() => playSound(evt.category === "good" ? "good" : "bad"), 220);
        break;
      }
      case "shield": {
        playSound("shielded");
        break;
      }
      case "skip": {
        playSound("skip");
        break;
      }
      case "relocate": {
        playSound("good");
        break;
      }
      case "peek": {
        playSound("good");
        break;
      }
      case "eliminate": {
        playSound("eliminate");
        break;
      }
      case "win": {
        playSound("victory");
        break;
      }
      case "draw_end": {
        playSound("victory");
        break;
      }
    }
  }, [game.session.lastEvent, game.session.effectSeq, mySocketId]);

  // Listen for peek result event (sent only to drawer).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: Event) => {
      const ce = e as CustomEvent<PeekResult>;
      if (!ce.detail) return;
      setPeekResult(ce.detail);
      // Auto-dismiss after 5s
      setTimeout(() => setPeekResult(null), 5000);
    };
    window.addEventListener("cup-game-peek-result", handler);
    return () => window.removeEventListener("cup-game-peek-result", handler);
  }, []);

  // Clear drawnCard once card is no longer pending and a turn has elapsed.
  useEffect(() => {
    if (!game.session.pendingCard) {
      const t = setTimeout(() => setDrawnCard(null), 1800);
      return () => clearTimeout(t);
    }
  }, [game.session.pendingCard]);

  const me = game.players.find((p) => p.socketId === mySocketId) || null;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <CupGameHeader
        game={game}
        muted={muted}
        onToggleMute={() => {
          const next = !muted;
          setSoundMuted(next);
          setMutedState(next);
        }}
        onReset={
          mySocketId === game.creatorSocketId || props.isRoomHost
            ? () => props.resetCupGame(game.gameId)
            : undefined
        }
      />

      {/* Phase-specific body. The keyed wrapper around PlayingView retriggers
          the panel-shake animation each time the local player takes a hit. */}
      {status === "lobby" && <LobbyView {...props} game={game} />}
      {status === "placing" && <PlacingView {...props} game={game} />}
      {status === "playing" && (
        <div
          key={panelShakeKey}
          className={panelShakeKey ? "cup-panel-shake" : ""}
        >
          <PlayingView
            {...props}
            game={game}
            me={me}
            recentFlippedCup={recentFlippedCup}
            hitFlippedCup={hitFlippedCup}
            shieldedFlippedCup={shieldedFlippedCup}
            drawnCard={drawnCard}
            peekResult={peekResult}
            dismissPeek={() => setPeekResult(null)}
            heartPopOnSocket={heartPopOnSocket}
          />
        </div>
      )}
      {status === "finished" && (
        <FinishedView {...props} game={game} />
      )}
    </div>
  );
}

// ── Header ──────────────────────────────────────────────────────────────────

function CupGameHeader({
  game,
  muted,
  onToggleMute,
  onReset,
}: {
  game: CupGameData;
  muted: boolean;
  onToggleMute: () => void;
  onReset?: () => void;
}) {
  const phaseBadge = (() => {
    if (game.session.status === "lobby") return { text: "Lobby", color: "bg-sky-500/20 text-sky-300 border-sky-400/30" };
    if (game.session.status === "placing") return { text: "Placing spiders", color: "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-400/30" };
    if (game.session.status === "playing") return { text: "Playing", color: "bg-emerald-500/20 text-emerald-300 border-emerald-400/30" };
    return { text: "Finished", color: "bg-slate-500/20 text-slate-300 border-slate-400/30" };
  })();
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm">
        <span className={`px-2 py-0.5 rounded-full text-xs border ${phaseBadge.color}`}>
          {phaseBadge.text}
        </span>
        <span className="text-slate-400">
          {game.config.rows}×{game.config.cols} grid · {game.config.startingLives} lives
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleMute}
          className="h-8 px-3 text-xs rounded-lg border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
          aria-label={muted ? "Unmute sounds" : "Mute sounds"}
        >
          {muted ? "🔇 Sound off" : "🔊 Sound on"}
        </button>
        {onReset && (
          <button
            type="button"
            onClick={() => {
              if (confirm("Reset / delete this game?")) onReset();
            }}
            className="h-8 px-3 text-xs rounded-lg border border-rose-400/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

// ── Lobby (no game yet) ────────────────────────────────────────────────────

function CupGameLobby(props: CupGamePanelProps) {
  const [lives, setLives] = useState(3);
  const [gridSize, setGridSize] = useState<"compact" | "standard" | "large">("standard");
  const [timer, setTimer] = useState<20 | 30 | 60 | null>(20);
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-3xl" aria-hidden>🥤</span>
          <div>
            <h3 className="text-lg font-bold text-slate-100">Cup Spider</h3>
            <p className="text-xs text-slate-400">Hide spiders, take turns flipping cups, push your luck on cards.</p>
          </div>
        </div>
        <ul className="text-xs text-slate-300/90 mt-3 space-y-1.5 list-disc pl-5">
          <li>Each player hides 0–{lives} spiders under cups during placement.</li>
          <li>On your turn, flip a cup OR draw a card (5 good, 5 bad — uniform random).</li>
          <li>If you flip a spider, you lose a life. Last with lives wins.</li>
        </ul>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">Lives</div>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setLives(n)}
                className={`flex-1 h-8 rounded-lg text-sm border transition-colors ${
                  lives === n
                    ? "border-sky-400/60 bg-sky-500/20 text-sky-200"
                    : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
                aria-pressed={lives === n ? "true" : "false"}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">Grid</div>
          <div className="flex items-center gap-1">
            {(["compact", "standard", "large"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGridSize(g)}
                className={`flex-1 h-8 rounded-lg text-xs border transition-colors capitalize ${
                  gridSize === g
                    ? "border-sky-400/60 bg-sky-500/20 text-sky-200"
                    : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
                aria-pressed={gridSize === g ? "true" : "false"}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">Turn timer</div>
          <div className="flex items-center gap-1">
            {([20, 30, 60, null] as const).map((t) => (
              <button
                key={String(t)}
                type="button"
                onClick={() => setTimer(t as 20 | 30 | 60 | null)}
                className={`flex-1 h-8 rounded-lg text-xs border transition-colors ${
                  timer === t
                    ? "border-sky-400/60 bg-sky-500/20 text-sky-200"
                    : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
                aria-pressed={timer === t ? "true" : "false"}
              >
                {t === null ? "Off" : `${t}s`}
              </button>
            ))}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() =>
          props.createCupGame({
            startingLives: lives,
            gridSize,
            turnTimerSeconds: timer,
          })
        }
        className="h-11 px-4 rounded-xl border border-emerald-400/30 bg-emerald-500/15 text-emerald-200 text-sm font-semibold hover:bg-emerald-500/25 transition"
      >
        Create lobby
      </button>
    </div>
  );
}

// ── Lobby (game exists, status: lobby) ─────────────────────────────────────

function LobbyView(props: CupGamePanelProps & { game: CupGameData }) {
  const { game, mySocketId } = props;
  const isCreator = game.creatorSocketId === mySocketId;
  const eligible = game.players.filter((p) => !p.isSpectator);
  const canStart = isCreator && eligible.length >= 2;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-4 lg:gap-5">
      <div className="flex flex-col gap-3">
        <PlayerList players={game.players} mySocketId={mySocketId} />
        {isCreator && (
          <ConfigEditor
            game={game}
            onChange={(opts) => props.updateCupGameConfig(game.gameId, opts)}
          />
        )}
        <button
          type="button"
          disabled={!canStart}
          onClick={() => props.startCupGamePlacement(game.gameId)}
          className="h-11 rounded-xl border border-emerald-400/30 bg-emerald-500/15 text-emerald-200 text-sm font-semibold hover:bg-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCreator
            ? eligible.length < 2
              ? "Waiting for at least 2 players…"
              : "Begin placement"
            : "Waiting for the host to begin…"}
        </button>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h4 className="text-sm font-semibold text-slate-100 mb-2">How it works</h4>
        <ol className="text-xs text-slate-300 space-y-1.5 list-decimal pl-4">
          <li>When the host begins, every player hides 0–{game.config.startingLives} spiders under cups.</li>
          <li>On your turn, flip a cup or draw a card.</li>
          <li>Flipping a spider costs you a life — the owner is safe (unless they flipped it themselves).</li>
          <li>5 good cards reward you (peek, shield, force a target, etc.); 5 bad cards punish (forced flips, skip).</li>
          <li>Last player with lives wins. If all spiders are found first, most-lives-left wins.</li>
        </ol>
      </div>
    </div>
  );
}

function ConfigEditor({
  game,
  onChange,
}: {
  game: CupGameData;
  onChange: (opts: CreateCupGameOptions) => void;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 flex flex-col gap-3">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">Lives</div>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange({ startingLives: n })}
              className={`flex-1 h-8 rounded-lg text-sm border ${
                game.config.startingLives === n
                  ? "border-sky-400/60 bg-sky-500/20 text-sky-200"
                  : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
              aria-pressed={game.config.startingLives === n ? "true" : "false"}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">Grid</div>
        <div className="flex gap-1">
          {(["compact", "standard", "large"] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => onChange({ gridSize: g })}
              className="flex-1 h-8 rounded-lg text-xs border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 capitalize"
            >
              {g}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">Turn timer</div>
        <div className="flex gap-1">
          {([20, 30, 60, null] as const).map((t) => (
            <button
              key={String(t)}
              type="button"
              onClick={() => onChange({ turnTimerSeconds: t as 20 | 30 | 60 | null })}
              className={`flex-1 h-8 rounded-lg text-xs border ${
                game.config.turnTimerSeconds === t
                  ? "border-sky-400/60 bg-sky-500/20 text-sky-200"
                  : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
              aria-pressed={game.config.turnTimerSeconds === t ? "true" : "false"}
            >
              {t === null ? "Off" : `${t}s`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Placing phase ──────────────────────────────────────────────────────────

function PlacingView(props: CupGamePanelProps & { game: CupGameData }) {
  const { game, mySocketId } = props;
  const me = game.players.find((p) => p.socketId === mySocketId);
  const cupRoles: CupRole[] = useMemo(() => {
    return game.cups.map((c) => {
      if (c.status === "flipped") return "idle";
      if (c.mineSpider) return "placement-mine";
      // We can't know which cup belongs to other players, but we can know
      // whether *any* spider is there because the server tells us mineSpider
      // only for ours. Other-player cups look like empty placement cells.
      if (me?.isPlacementLocked) return "placement-disabled";
      return "placement-empty";
    });
  }, [game.cups, me?.isPlacementLocked]);

  const remaining = (me?.spiderBudget ?? 0) - (me?.spidersPlaced ?? 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-4 lg:gap-5">
      <div className="flex flex-col gap-3">
        <div className="rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/10 px-4 py-3 text-sm text-fuchsia-200">
          <strong>Place your spiders.</strong> You can hide up to{" "}
          <span className="font-semibold">{me?.spiderBudget ?? 0}</span>. You&rsquo;ve placed{" "}
          <span className="font-semibold">{me?.spidersPlaced ?? 0}</span>{" "}
          ({remaining} remaining). Memorize where they are — your own cups don&rsquo;t hurt anyone but you, if you flip one yourself.
        </div>
        <CupGrid
          cols={game.config.cols}
          cups={game.cups}
          roles={cupRoles}
          onCupClick={(idx) => props.toggleCupGameSpider(game.gameId, idx)}
        />
      </div>
      <div className="flex flex-col gap-3">
        <PlayerList players={game.players} mySocketId={mySocketId} placingPhase />
        {me && !me.isSpectator && (
          <button
            type="button"
            onClick={() =>
              me.isPlacementLocked
                ? props.unlockCupGamePlacement(game.gameId)
                : props.lockCupGamePlacement(game.gameId)
            }
            className={`h-11 rounded-xl text-sm font-semibold border transition ${
              me.isPlacementLocked
                ? "border-amber-400/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"
                : "border-emerald-400/30 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
            }`}
          >
            {me.isPlacementLocked ? "Unlock my placement" : "I'm ready"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Playing phase ──────────────────────────────────────────────────────────

function PlayingView(
  props: CupGamePanelProps & {
    game: CupGameData;
    me: CupGamePlayer | null;
    recentFlippedCup: number | null;
    hitFlippedCup: number | null;
    shieldedFlippedCup: number | null;
    drawnCard: { kind: CupGameCardKind; category: "good" | "bad"; key: number } | null;
    peekResult: PeekResult | null;
    dismissPeek: () => void;
    heartPopOnSocket: string | null;
  },
) {
  const {
    game,
    mySocketId,
    me,
    recentFlippedCup,
    hitFlippedCup,
    shieldedFlippedCup,
    drawnCard,
    peekResult,
    dismissPeek,
    heartPopOnSocket,
  } = props;

  const myTurn = game.session.currentTurnSocketId === mySocketId;
  const pending = game.session.pendingCard;
  const iAmDrawer = pending && pending.drawerSocketId === mySocketId;

  // Build per-cup roles
  const cupRoles: CupRole[] = useMemo(() => {
    return game.cups.map((c) => {
      if (c.status === "flipped") return "idle";
      if (c.mineSpider) return "mineSpider";
      if (iAmDrawer && pending) {
        if (pending.awaiting === "pickCup") {
          if (pending.kind === "peek") return "selectable";
          return "selectable";
        }
        if (pending.awaiting === "pickRow") return "row-target";
        if (pending.awaiting === "pickBlock") return "block-corner";
        if (pending.awaiting === "pickRelocateSrc") {
          return c.mineSpider ? "relocate-src" : "idle";
        }
        if (pending.awaiting === "pickRelocateDst") {
          if (c.index === pending.srcCupIndex) return "relocate-src";
          return "relocate-dst-eligible";
        }
        if (pending.awaiting === "pickTargetCup") return "selectable";
        return "idle";
      }
      if (myTurn && !pending && me && !me.eliminated) return "selectable";
      return "idle";
    });
  }, [game.cups, iAmDrawer, pending, myTurn, me]);

  const handleCupClick = (idx: number) => {
    if (pending && iAmDrawer) {
      if (pending.awaiting === "pickCup" || pending.awaiting === "pickTargetCup") {
        if (pending.kind === "peek" || pending.kind === "flipPlusOne" || pending.kind === "flipPlusTwo") {
          props.flipCup(game.gameId, idx);
          return;
        }
        if (pending.awaiting === "pickTargetCup") {
          props.resolveCupGameCard(game.gameId, { cupIndex: idx });
          return;
        }
      }
      if (pending.awaiting === "pickRelocateSrc") {
        props.resolveCupGameCard(game.gameId, { fromCupIndex: idx });
        return;
      }
      if (pending.awaiting === "pickRelocateDst") {
        props.resolveCupGameCard(game.gameId, { toCupIndex: idx });
        return;
      }
      return;
    }
    if (myTurn && !pending) {
      props.flipCup(game.gameId, idx);
    }
  };

  const handleRowPick = (rowIdx: number) => {
    if (pending && iAmDrawer && pending.awaiting === "pickRow") {
      props.resolveCupGameCard(game.gameId, { rowIndex: rowIdx });
    }
  };
  const handleBlockPick = (topLeftIdx: number) => {
    if (pending && iAmDrawer && pending.awaiting === "pickBlock") {
      props.resolveCupGameCard(game.gameId, { blockTopLeftCupIndex: topLeftIdx });
    }
  };

  const targetSelector = pending && iAmDrawer && (pending.awaiting === "pickTarget" || pending.awaiting === "pickTargetCup");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-4 lg:gap-5">
      <div className="flex flex-col gap-3">
        <TurnBanner
          game={game}
          me={me}
          mySocketId={mySocketId}
          pending={pending}
          drawnCard={drawnCard}
        />
        <CupGrid
          cols={game.config.cols}
          cups={game.cups}
          roles={cupRoles}
          recentFlippedCup={recentFlippedCup}
          hitFlippedCup={hitFlippedCup}
          shieldedFlippedCup={shieldedFlippedCup}
          onCupClick={handleCupClick}
          rows={game.config.rows}
          onRowClick={pending?.awaiting === "pickRow" ? handleRowPick : undefined}
          onBlockClick={pending?.awaiting === "pickBlock" ? handleBlockPick : undefined}
        />
        {peekResult && (
          <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 flex items-center justify-between gap-3">
            <span>
              <span className="font-semibold">Peek:</span> Cup #{peekResult.cupIndex + 1} hides{" "}
              {peekResult.revealedAs === "spider" ? (
                <span className="font-semibold text-rose-300">a spider 🕷️</span>
              ) : (
                <span className="font-semibold text-emerald-300">nothing — empty</span>
              )}
              .
            </span>
            <button
              type="button"
              onClick={dismissPeek}
              className="text-xs px-2 py-1 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-slate-200"
            >
              Got it
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-3">
        <PlayerList
          players={game.players}
          mySocketId={mySocketId}
          currentTurnSocketId={game.session.currentTurnSocketId}
          heartPopOnSocket={heartPopOnSocket}
        />
        {myTurn && !pending && me && !me.eliminated && (
          <button
            type="button"
            onClick={() => props.drawCupGameCard(game.gameId)}
            className="h-12 rounded-xl border border-fuchsia-400/40 bg-gradient-to-br from-fuchsia-500/20 to-purple-500/15 text-fuchsia-100 text-sm font-semibold hover:from-fuchsia-500/30 hover:to-purple-500/20 transition cup-deck-bob"
          >
            🎴 Push your luck — draw a card
          </button>
        )}
        {pending && iAmDrawer && (pending.awaiting === "pickRow" || pending.awaiting === "pickBlock" || pending.awaiting === "pickRelocateSrc" || pending.awaiting === "pickRelocateDst" || pending.awaiting === "pickTarget" || pending.awaiting === "pickTargetCup") && (
          <button
            type="button"
            onClick={() => props.cancelCupGameCard(game.gameId)}
            className="h-9 rounded-xl border border-rose-400/30 bg-rose-500/10 text-rose-300 text-xs font-semibold hover:bg-rose-500/20"
          >
            Cancel card
          </button>
        )}
        {targetSelector && pending && (
          <TargetPicker
            game={game}
            mySocketId={mySocketId}
            kind={pending.kind}
            onPick={(targetSocketId) =>
              props.resolveCupGameCard(game.gameId, { targetSocketId })
            }
          />
        )}
      </div>
    </div>
  );
}

function TurnBanner({
  game,
  me,
  mySocketId,
  pending,
  drawnCard,
}: {
  game: CupGameData;
  me: CupGamePlayer | null;
  mySocketId: string;
  pending: CupGameData["session"]["pendingCard"];
  drawnCard: { kind: CupGameCardKind; category: "good" | "bad"; key: number } | null;
}) {
  const myTurn = game.session.currentTurnSocketId === mySocketId;
  const turnPlayer = game.players.find((p) => p.socketId === game.session.currentTurnSocketId);
  if (pending) {
    const meta = CARD_META[pending.kind];
    const drawer = game.players.find((p) => p.socketId === pending.drawerSocketId);
    const drawerName = drawer?.username || "Someone";
    let action = "";
    if (pending.awaiting === "pickCup") {
      if (pending.kind === "peek") action = "is peeking — picking a cup";
      else action = `must flip ${pending.remainingFlips ?? 1} cup${(pending.remainingFlips ?? 1) > 1 ? "s" : ""}`;
    } else if (pending.awaiting === "pickRow") action = "is choosing a row to flip";
    else if (pending.awaiting === "pickBlock") action = "is choosing a 2×2 block";
    else if (pending.awaiting === "pickTarget") action = "is choosing a target";
    else if (pending.awaiting === "pickTargetCup") action = "picked a target — now choosing the cup";
    else if (pending.awaiting === "pickRelocateSrc") action = "is choosing which spider to move";
    else if (pending.awaiting === "pickRelocateDst") action = "is choosing where to move it";
    return (
      <div className={`rounded-xl border px-4 py-3 ${meta.category === "good" ? "border-emerald-400/30 bg-emerald-500/10" : "border-rose-400/30 bg-rose-500/10"}`}>
        <div className="flex items-center gap-3">
          {drawnCard && drawnCard.kind === pending.kind && (
            <div className={`cup-card-flip-in shrink-0 w-14 h-20 rounded-xl border ${meta.category === "good" ? "border-emerald-300/60 bg-emerald-900/40" : "border-rose-300/60 bg-rose-900/40"} flex flex-col items-center justify-center`}>
              <div className="text-2xl" aria-hidden>{meta.emoji}</div>
              <div className="text-[8px] uppercase tracking-wider text-white/70 mt-0.5">{meta.category}</div>
            </div>
          )}
          <div className="text-sm">
            <div className="font-semibold text-slate-100">{drawerName} drew {meta.label}</div>
            <div className="text-xs text-slate-300/90">{meta.blurb} — {action}.</div>
          </div>
        </div>
      </div>
    );
  }
  if (game.session.status !== "playing") return null;
  return (
    <div className={`rounded-xl border px-4 py-3 flex items-center justify-between ${myTurn ? "border-sky-400/40 bg-sky-500/10" : "border-white/10 bg-white/5"}`}>
      <div className="flex items-center gap-2 text-sm">
        <span className={`inline-block w-2 h-2 rounded-full ${myTurn ? "bg-sky-300 animate-pulse" : "bg-slate-400"}`} />
        <span className="font-semibold text-slate-100">
          {myTurn ? "Your turn" : `${turnPlayer?.username || "Someone"}'s turn`}
        </span>
        {turnPlayer && (
          <span className="text-xs text-slate-400">
            · {turnPlayer.lives} {turnPlayer.lives === 1 ? "life" : "lives"} left
          </span>
        )}
        {me?.hasShield && myTurn && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-200 border border-sky-400/30">🛡 Shield up</span>
        )}
      </div>
      {game.session.turnDeadline && (
        <TurnCountdown deadline={game.session.turnDeadline} serverNow={game.session.serverNow} />
      )}
    </div>
  );
}

function TurnCountdown({ deadline, serverNow }: { deadline: number; serverNow: number }) {
  const offset = Date.now() - serverNow;
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 250);
    return () => clearInterval(t);
  }, []);
  const remainingMs = Math.max(0, deadline - (Date.now() - offset));
  const seconds = Math.ceil(remainingMs / 1000);
  return (
    <span className={`text-xs font-mono px-2 py-0.5 rounded-full border ${seconds <= 5 ? "border-rose-400/40 bg-rose-500/10 text-rose-300" : "border-white/10 bg-white/5 text-slate-300"}`}>
      ⏱ {seconds}s
    </span>
  );
}

// ── Cup grid ───────────────────────────────────────────────────────────────

function CupGrid({
  cols,
  cups,
  roles,
  recentFlippedCup,
  hitFlippedCup,
  shieldedFlippedCup,
  onCupClick,
  rows,
  onRowClick,
  onBlockClick,
}: {
  cols: number;
  cups: CupGameData["cups"];
  roles: CupRole[];
  recentFlippedCup?: number | null;
  hitFlippedCup?: number | null;
  shieldedFlippedCup?: number | null;
  onCupClick: (cupIndex: number) => void;
  rows?: number;
  onRowClick?: (rowIndex: number) => void;
  onBlockClick?: (topLeftCupIndex: number) => void;
}) {
  if (onRowClick && rows) {
    // Render row-pick buttons next to each row.
    return (
      <div
        className="grid gap-2 select-none"
        style={{
          gridTemplateColumns: `auto repeat(${cols}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: rows }).map((_, r) => (
          <React.Fragment key={r}>
            <button
              type="button"
              onClick={() => onRowClick(r)}
              className="h-12 px-2 rounded-xl border border-amber-400/40 bg-amber-500/10 text-amber-200 text-xs font-semibold hover:bg-amber-500/20"
            >
              Row {r + 1}
            </button>
            {Array.from({ length: cols }).map((_, c) => {
              const idx = r * cols + c;
              return (
                <Cup
                  key={idx}
                  cup={cups[idx]!}
                  role={roles[idx]!}
                  recentlyFlipped={recentFlippedCup === idx}
                  hitOnFlip={hitFlippedCup === idx}
                  shieldedOnFlip={shieldedFlippedCup === idx}
                />
              );
            })}
          </React.Fragment>
        ))}
      </div>
    );
  }
  return (
    <div
      className="grid gap-2 sm:gap-3 select-none"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      }}
    >
      {cups.map((cup) => {
        const role = roles[cup.index]!;
        const handle = () => {
          if (onBlockClick && role === "block-corner") {
            onBlockClick(cup.index);
          } else {
            onCupClick(cup.index);
          }
        };
        return (
          <Cup
            key={cup.index}
            cup={cup}
            role={role}
            onClick={handle}
            recentlyFlipped={recentFlippedCup === cup.index}
            hitOnFlip={hitFlippedCup === cup.index}
            shieldedOnFlip={shieldedFlippedCup === cup.index}
          />
        );
      })}
    </div>
  );
}

// ── Player list ────────────────────────────────────────────────────────────

function PlayerList({
  players,
  mySocketId,
  currentTurnSocketId,
  placingPhase,
  heartPopOnSocket,
}: {
  players: CupGameData["players"];
  mySocketId: string;
  currentTurnSocketId?: string | null;
  placingPhase?: boolean;
  heartPopOnSocket?: string | null;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
      <div className="px-3 py-2 border-b border-white/10 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
        Players
      </div>
      <ul className="divide-y divide-white/5">
        {players.map((p) => {
          const isMe = p.socketId === mySocketId;
          const isTurn = p.socketId === currentTurnSocketId;
          const popping = heartPopOnSocket === p.socketId;
          return (
            <li
              key={p.socketId}
              className={`relative flex items-center gap-2 px-3 py-2 ${
                isTurn ? "bg-sky-500/10" : ""
              } ${p.eliminated ? "opacity-50" : ""}`}
            >
              <span className={`inline-block w-2 h-2 rounded-full ${isTurn ? "bg-sky-300 animate-pulse" : "bg-slate-500"}`} />
              <span className={`text-sm font-medium truncate ${isMe ? "text-sky-200" : "text-slate-200"}`}>
                {p.username || "Player"}{isMe && " (you)"}
              </span>
              <span className="ml-auto flex items-center gap-1.5">
                {placingPhase && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-400/20">
                    {p.spidersPlaced}/{p.spiderBudget} 🕷
                    {p.isPlacementLocked && " ✓"}
                  </span>
                )}
                {p.hasShield && <span className="text-xs">🛡</span>}
                {p.skipNextTurn && <span className="text-xs">💤</span>}
                {p.isSpectator && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-500/20 text-slate-300 border border-slate-400/30">
                    Spectator
                  </span>
                )}
                {!p.isSpectator && (
                  <span className="flex gap-0.5">
                    {Array.from({ length: p.spiderBudget }).map((_, i) => (
                      <span key={i} className={`text-xs ${i < p.lives ? "" : "opacity-25"}`}>
                        ❤️
                      </span>
                    ))}
                  </span>
                )}
              </span>
              {popping && (
                <span className="cup-heart-pop absolute right-3 top-1.5 text-2xl pointer-events-none" aria-hidden>
                  💔
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Target picker ──────────────────────────────────────────────────────────

function TargetPicker({
  game,
  mySocketId,
  kind,
  onPick,
}: {
  game: CupGameData;
  mySocketId: string;
  kind: CupGameCardKind;
  onPick: (socketId: string) => void;
}) {
  const candidates = game.players.filter(
    (p) => !p.isSpectator && !p.eliminated && p.socketId !== mySocketId,
  );
  const meta = CARD_META[kind];
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="text-xs font-semibold text-slate-100 mb-2 flex items-center gap-2">
        <span aria-hidden>{meta.emoji}</span>
        Pick a target
      </div>
      <div className="flex flex-col gap-1.5">
        {candidates.map((p) => (
          <button
            key={p.socketId}
            type="button"
            onClick={() => onPick(p.socketId)}
            className="h-9 px-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-sm text-slate-200 text-left flex items-center justify-between"
          >
            <span>{p.username || "Player"}</span>
            <span className="text-xs text-slate-400">{p.lives} ❤️</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Finished view ──────────────────────────────────────────────────────────

function FinishedView(props: CupGamePanelProps & { game: CupGameData }) {
  const { game } = props;
  const winner = game.session.winnerSocketId
    ? game.players.find((p) => p.socketId === game.session.winnerSocketId)
    : null;
  const drawWinners = (game.session.drawWinnerSocketIds || [])
    .map((sid) => game.players.find((p) => p.socketId === sid))
    .filter(Boolean) as CupGamePlayer[];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-4 lg:gap-5">
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-amber-400/40 bg-gradient-to-br from-amber-500/15 to-orange-500/10 p-6 text-center">
          <div className="text-5xl mb-2" aria-hidden>🏆</div>
          {winner ? (
            <>
              <div className="text-xl font-bold text-amber-100">
                {winner.username || "Player"} wins!
              </div>
              <div className="text-xs text-amber-200/80 mt-1">Last spider standing.</div>
            </>
          ) : drawWinners.length > 1 ? (
            <>
              <div className="text-xl font-bold text-amber-100">
                Tie: {drawWinners.map((p) => p.username || "Player").join(", ")}
              </div>
              <div className="text-xs text-amber-200/80 mt-1">All spiders found — most lives left.</div>
            </>
          ) : (
            <div className="text-lg font-bold text-amber-100">Game over</div>
          )}
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2">
            Final grid
          </div>
          <CupGrid
            cols={game.config.cols}
            cups={game.cups.map((c) => ({
              ...c,
              status: "flipped" as const,
              revealedAs: c.status === "flipped" ? c.revealedAs : (c.mineSpider ? "spider" : "empty"),
            }))}
            roles={game.cups.map(() => "idle" as CupRole)}
            onCupClick={() => undefined}
          />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <PlayerList players={game.players} mySocketId={props.mySocketId} />
        <button
          type="button"
          onClick={() => props.resetCupGame(game.gameId)}
          className="h-11 rounded-xl border border-emerald-400/30 bg-emerald-500/15 text-emerald-200 text-sm font-semibold hover:bg-emerald-500/25"
        >
          New game
        </button>
      </div>
    </div>
  );
}
