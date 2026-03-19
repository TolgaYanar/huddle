import React from "react";

export function CallHeader(props: {
  localSpeaking: boolean;
  isCallCollapsed: boolean;
  setIsCallCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const { localSpeaking, isCallCollapsed, setIsCallCollapsed } = props;

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-sm text-slate-100">Call</span>
        <span
          className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border transition-colors ${
            localSpeaking
              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
              : "bg-black/20 border-white/10 text-slate-400"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${localSpeaking ? "bg-emerald-400" : "bg-slate-500"}`}
          />
          {localSpeaking ? "Speaking" : "Muted"}
        </span>
      </div>

      <button
        type="button"
        onClick={() => setIsCallCollapsed((v) => !v)}
        className="h-7 px-2.5 rounded-lg border border-white/10 bg-white/5 text-slate-400 text-xs hover:bg-white/10 hover:text-slate-200 transition-colors"
        title={isCallCollapsed ? "Expand call" : "Collapse call"}
      >
        {isCallCollapsed ? "Expand" : "Collapse"}
      </button>
    </div>
  );
}
