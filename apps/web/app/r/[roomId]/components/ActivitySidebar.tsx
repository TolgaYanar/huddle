import React from "react";

export type ActivityLogEntry = {
  id?: string;
  msg: string;
  type: string;
  time: string;
  user: string;
};

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
  } = props;

  return (
    <aside className="backdrop-blur-md bg-white/5 rounded-2xl border border-white/10 flex flex-col overflow-hidden min-h-0 max-h-[calc(100vh-4rem-3rem)] lg:max-h-[calc(100vh-4rem-4rem)] lg:col-start-3 lg:row-start-1">
      <div
        className={`border-b border-white/10 bg-white/5 ${
          isActivityCollapsed ? "p-2" : "p-4"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className={isActivityCollapsed ? "sr-only" : ""}>
            <div className="font-semibold text-slate-50">Activity Feed</div>
            <div className="text-xs text-slate-400 mt-1">
              Room: <span className="font-mono text-slate-300">{roomId}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsActivityCollapsed((v) => !v)}
            className="h-9 w-9 rounded-xl border border-white/20 bg-black/40 text-slate-50 text-sm font-semibold hover:bg-white/10 transition-colors inline-flex items-center justify-center"
            title={
              isActivityCollapsed ? "Expand activity" : "Collapse activity"
            }
          >
            {isActivityCollapsed ? "⟩" : "⟨"}
          </button>
        </div>
      </div>

      <div
        className={`flex-1 min-h-0 overflow-y-auto p-4 space-y-3 ${
          isActivityCollapsed ? "hidden" : ""
        }`}
      >
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
              <strong className="text-slate-200">{log.user}</strong> {log.msg}
            </div>
          </div>
        ))}
        <div ref={logsEndRef} />
      </div>

      <form
        onSubmit={handleSendChat}
        className={`p-3 border-t border-white/10 bg-black/20 flex gap-2 ${
          isActivityCollapsed ? "hidden" : ""
        }`}
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
    </aside>
  );
}
