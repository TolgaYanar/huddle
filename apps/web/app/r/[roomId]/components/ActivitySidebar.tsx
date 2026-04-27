"use client";

import React, { useState } from "react";
import type { GamePanelProps } from "./GamePanel";
import type { CupGamePanelProps } from "./cupGame/CupGamePanel";

const AVAILABLE_GAMES: {
  id: string;
  name: string;
  description: string;
  emoji: string;
}[] = [
  {
    id: "guess-it",
    name: "Guess It!",
    description:
      "Post clue images, others guess the answer turn by turn. Reveal hints letter by letter.",
    emoji: "🔍",
  },
  {
    id: "cup-spider",
    name: "Cup Spider",
    description:
      "Hide spiders under cups, take turns flipping. Push your luck on cards — 5 good, 5 bad.",
    emoji: "🥤",
  },
];

export type ActivityLogEntry = {
  id?: string;
  msg: string;
  type: string;
  time: string;
  user: string;
};

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"] as const;

const EVENT_COLORS: Record<string, string> = {
  play: "text-emerald-400",
  pause: "text-amber-400",
  seek: "text-indigo-400",
  change_url: "text-rose-400",
  join: "text-violet-400",
  leave: "text-slate-500",
  error: "text-red-400",
};

const EVENT_ICONS: Record<string, string> = {
  play: "▶",
  pause: "⏸",
  seek: "⇄",
  change_url: "↗",
  join: "→",
  leave: "←",
  error: "!",
};

function userColor(name: string): string {
  const palette = [
    "bg-sky-600/60 text-sky-100",
    "bg-violet-600/60 text-violet-100",
    "bg-emerald-600/60 text-emerald-100",
    "bg-rose-600/60 text-rose-100",
    "bg-amber-600/60 text-amber-100",
    "bg-indigo-600/60 text-indigo-100",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return palette[h % palette.length]!;
}

type Tab = "activity" | "games";

export function ActivitySidebar(props: {
  roomId: string;
  userId: string;
  isConnected: boolean;

  isActivityCollapsed: boolean;
  setIsActivityCollapsed: React.Dispatch<React.SetStateAction<boolean>>;

  logs: ActivityLogEntry[];
  logsEndRef: React.RefObject<HTMLDivElement | null>;
  capitalize: (s: string) => string;

  chatText: string;
  setChatText: React.Dispatch<React.SetStateAction<string>>;
  handleSendChat: (e: React.FormEvent) => void;

  reactions: Record<string, Record<string, string[]>>;
  addReaction: (messageId: string, emoji: string) => void;

  gameProps: GamePanelProps;
  cupGameProps: CupGamePanelProps;
  onOpenGame: (gameId: string) => void;
}) {
  const {
    roomId,
    userId,
    isConnected,
    isActivityCollapsed,
    setIsActivityCollapsed,
    logs,
    logsEndRef,
    chatText,
    setChatText,
    handleSendChat,
    reactions,
    addReaction,
    gameProps,
    cupGameProps,
    onOpenGame,
  } = props;

  const [activeTab, setActiveTab] = useState<Tab>("activity");
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);

  const hasActiveGame = gameProps.gameState.games.some(
    (g) => g.status === "active" || g.status === "finished",
  );
  const hasActiveCupGame = cupGameProps.cupGameState.games.some(
    (g) =>
      g.session.status === "playing" ||
      g.session.status === "placing" ||
      g.session.status === "finished",
  );

  return (
    <aside className="backdrop-blur-md bg-white/5 rounded-2xl border border-white/10 flex flex-col overflow-hidden min-h-0 max-h-[calc(100vh-4rem-3rem)] lg:max-h-[calc(100vh-4rem-4rem)] lg:col-start-3 lg:row-start-1">
      {/* Header */}
      <div
        className={`border-b border-white/10 bg-white/5 ${
          isActivityCollapsed ? "p-2" : "p-3"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          {!isActivityCollapsed && (
            <div className="flex gap-1 flex-1">
              <button
                type="button"
                onClick={() => setActiveTab("activity")}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  activeTab === "activity"
                    ? "bg-white/10 text-slate-100"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                }`}
              >
                Chat
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("games")}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors relative ${
                  activeTab === "games"
                    ? "bg-white/10 text-slate-100"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                }`}
              >
                Games
                {hasActiveGame && activeTab !== "games" && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-sky-400" />
                )}
              </button>
            </div>
          )}

          {isActivityCollapsed && (
            <div className="sr-only">
              Room: <span className="font-mono">{roomId}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsActivityCollapsed((v) => !v)}
            className="h-8 w-8 rounded-xl border border-white/20 bg-black/40 text-slate-50 text-sm font-semibold hover:bg-white/10 transition-colors inline-flex items-center justify-center shrink-0"
            title={
              isActivityCollapsed ? "Expand activity" : "Collapse activity"
            }
          >
            {isActivityCollapsed ? "⟩" : "⟨"}
          </button>
        </div>
      </div>

      {/* Chat/Activity tab */}
      {!isActivityCollapsed && activeTab === "activity" && (
        <>
          <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 flex flex-col gap-0">
            {logs.length === 0 && (
              <div className="text-center text-slate-500 mt-8 text-sm">
                No messages yet…
              </div>
            )}

            {logs.map((log, i) => {
              const prev = logs[i - 1];
              const next = logs[i + 1];

              if (log.type === "chat") {
                const isFirstInGroup =
                  !prev || prev.type !== "chat" || prev.user !== log.user;
                const isLastInGroup =
                  !next || next.type !== "chat" || next.user !== log.user;
                const msgReactions = log.id ? (reactions[log.id] ?? {}) : {};
                const hasReactions = Object.keys(msgReactions).length > 0;
                const avatarColor = userColor(log.user);

                return (
                  <div
                    key={i}
                    className={`flex gap-2.5 ${isFirstInGroup ? "mt-4 first:mt-0" : "mt-0.5"}`}
                  >
                    {/* Avatar column */}
                    <div className="w-7 shrink-0 pt-0.5">
                      {isFirstInGroup ? (
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${avatarColor}`}
                        >
                          {log.user[0]?.toUpperCase() ?? "?"}
                        </div>
                      ) : (
                        <div className="w-7" />
                      )}
                    </div>

                    {/* Message content */}
                    <div className="flex-1 min-w-0">
                      {isFirstInGroup && (
                        <div className="flex items-baseline gap-2 mb-0.5">
                          <span className="text-xs font-semibold text-slate-200 truncate">
                            {log.user}
                          </span>
                          <span className="text-[10px] text-slate-500 shrink-0">
                            {log.time}
                          </span>
                        </div>
                      )}

                      {/* Bubble + emoji picker */}
                      <div
                        className="relative group/msg"
                        onMouseEnter={() => setHoveredMsgId(log.id ?? null)}
                        onMouseLeave={() => setHoveredMsgId(null)}
                      >
                        <p className="text-sm text-slate-300 leading-relaxed break-words">
                          {log.msg}
                        </p>

                        {/* Emoji picker — appears on hover if message has an id */}
                        {log.id && hoveredMsgId === log.id && (
                          <div className="absolute -top-6 right-0 flex items-center gap-0.5 bg-slate-800/95 border border-white/10 rounded-full px-1.5 py-0.5 shadow-lg z-20">
                            {REACTION_EMOJIS.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  addReaction(log.id!, emoji);
                                }}
                                className="text-sm leading-none hover:scale-125 active:scale-110 transition-transform px-0.5"
                                title={emoji}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Reactions */}
                      {hasReactions && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {Object.entries(msgReactions).map(
                            ([emoji, userIds]) => {
                              const isMine = userIds.includes(userId);
                              return (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() =>
                                    log.id && addReaction(log.id, emoji)
                                  }
                                  className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors ${
                                    isMine
                                      ? "bg-sky-500/20 border-sky-500/40 text-sky-200 hover:bg-sky-500/30"
                                      : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                                  }`}
                                >
                                  <span>{emoji}</span>
                                  <span>{userIds.length}</span>
                                </button>
                              );
                            },
                          )}
                        </div>
                      )}

                      {/* Timestamp for non-first messages in group (on last) */}
                      {!isFirstInGroup && isLastInGroup && (
                        <div className="text-[10px] text-slate-600 mt-0.5">
                          {log.time}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              // System event — compact centered divider
              const color =
                EVENT_COLORS[log.type] ?? "text-slate-500";
              const icon = EVENT_ICONS[log.type] ?? "·";

              return (
                <div
                  key={i}
                  className="flex items-center gap-2 py-2 select-none"
                >
                  <div className="flex-1 h-px bg-white/5" />
                  <span className={`text-[10px] ${color} shrink-0 font-medium`}>
                    {icon} {log.user} {log.msg} · {log.time}
                  </span>
                  <div className="flex-1 h-px bg-white/5" />
                </div>
              );
            })}

            <div ref={logsEndRef} />
          </div>

          <form
            onSubmit={handleSendChat}
            className="p-3 border-t border-white/10 bg-black/20 flex gap-2"
          >
            <input
              type="text"
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              placeholder={isConnected ? "Type a message…" : "Connecting…"}
              disabled={!isConnected}
              className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/25 focus:border-sky-500/30 transition disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!isConnected || !chatText.trim()}
              className="h-9 px-4 rounded-xl border border-white/10 bg-white/5 text-slate-50 text-sm font-medium hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </form>
        </>
      )}

      {/* Games tab */}
      {!isActivityCollapsed && activeTab === "games" && (
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <div className="flex flex-col gap-3">
            <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">
              Choose a game
            </div>
            {AVAILABLE_GAMES.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => onOpenGame(g.id)}
                className="w-full text-left p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{g.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-200 group-hover:text-white">
                        {g.name}
                      </span>
                      {g.id === "guess-it" && hasActiveGame && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-600/30 text-sky-300 border border-sky-600/30">
                          Active
                        </span>
                      )}
                      {g.id === "cup-spider" && hasActiveCupGame && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-fuchsia-600/30 text-fuchsia-300 border border-fuchsia-600/30">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                      {g.description}
                    </div>
                  </div>
                  <span className="text-slate-500 group-hover:text-slate-300 text-lg transition-colors">
                    →
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
