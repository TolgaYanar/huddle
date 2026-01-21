import React from "react";

export function CallHeader(props: {
  localSpeaking: boolean;
  isCallCollapsed: boolean;
  setIsCallCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const { localSpeaking, isCallCollapsed, setIsCallCollapsed } = props;

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="font-semibold text-slate-50">Call</div>
        <div className="text-xs text-slate-400 mt-1">
          Screen share, webcam, and mic between users.
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span
          className={`px-2 py-1 rounded-full border border-white/10 ${
            localSpeaking
              ? "bg-emerald-500/15 text-emerald-200"
              : "bg-black/20 text-slate-300"
          }`}
        >
          {localSpeaking ? "Speaking" : "Silent"}
        </span>

        <button
          type="button"
          onClick={() => setIsCallCollapsed((v) => !v)}
          className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 text-slate-200 text-xs font-medium hover:bg-white/10 transition-colors"
          title={isCallCollapsed ? "Expand call" : "Collapse call"}
        >
          {isCallCollapsed ? "Expand" : "Collapse"}
        </button>
      </div>
    </div>
  );
}
