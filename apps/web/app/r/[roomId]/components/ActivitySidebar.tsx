import React, { useState } from "react";
import type { GamePanelProps } from "./GamePanel";

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
];

export type ActivityLogEntry = {
  id?: string;
  msg: string;
  type: string;
  time: string;
  user: string;
};

type Tab = "activity" | "games";

export function ActivitySidebar(props: {
  roomId: string;
  isConnected: boolean;

  isActivityCollapsed: boolean;
  setIsActivityCollapsed: React.Dispatch<React.SetStateAction<boolean>>;

  logs: ActivityLogEntry[];
  logsEndRef: React.RefObject<HTMLDivElement | null>;
  capitalize: (s: string) => string;

  chatText: string;
  setChatText: React.Dispatch<React.SetStateAction<string>>;
  handleSendChat: (e: React.FormEvent) => void;

  gameProps: GamePanelProps;
  onOpenGame: (gameId: string) => void;
}) {
  const {
    roomId,
    isConnected,
    isActivityCollapsed,
    setIsActivityCollapsed,
    logs,
    logsEndRef,
    capitalize,
    chatText,
    setChatText,
    handleSendChat,
    gameProps,
    onOpenGame,
  } = props;

  const [activeTab, setActiveTab] = useState<Tab>("activity");

  const hasActiveGame = gameProps.gameState.games.some(
    (g) => g.status === "active" || g.status === "finished",
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
                Activity
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

      {/* Activity tab */}
      {!isActivityCollapsed && activeTab === "activity" && (
        <>
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
            {logs.length === 0 && (
              <div className="text-center text-slate-500 mt-8 text-sm">
                Waiting for activity...
              </div>
            )}
            {logs.map((log, i) => (
              <div
                key={i}
                className={`p-3 rounded-xl bg-black/20 border border-white/5 text-sm ${
                  log.type === "play"
                    ? "border-l-4 border-l-emerald-500"
                    : log.type === "pause"
                      ? "border-l-4 border-l-amber-500"
                      : log.type === "seek"
                        ? "border-l-4 border-l-indigo-500"
                        : log.type === "change_url"
                          ? "border-l-4 border-l-rose-500"
                          : log.type === "chat"
                            ? "border-l-4 border-l-sky-500"
                            : log.type === "join" || log.type === "leave"
                              ? "border-l-4 border-l-violet-500"
                              : log.type === "error"
                                ? "border-l-4 border-l-red-600"
                                : ""
                }`}
              >
                <div className="flex justify-between items-center mb-1 text-xs text-slate-500">
                  <span className="uppercase tracking-wider font-bold text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400">
                    {capitalize(log.type)}
                  </span>
                  <span>{log.time}</span>
                </div>
                <div className="text-slate-300 leading-relaxed">
                  <strong className="text-slate-200">{log.user}</strong>{" "}
                  {log.msg}
                </div>
              </div>
            ))}
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

      {/* Games tab — lobby only */}
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
