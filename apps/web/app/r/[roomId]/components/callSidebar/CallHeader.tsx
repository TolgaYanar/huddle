import React from "react";

export function CallHeader(props: {
  localSpeaking: boolean;
  micEnabled: boolean;
  isCallCollapsed: boolean;
  setIsCallCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const { localSpeaking, micEnabled, isCallCollapsed, setIsCallCollapsed } =
    props;

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-sm text-ink">Call</span>
        <span
          className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border transition-colors ${
            localSpeaking
              ? "bg-positive-soft border-positive text-positive"
              : "bg-sunken border-hairline text-ink-muted"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${localSpeaking ? "bg-positive" : "bg-ink-faint"}`}
          />
          {localSpeaking ? "Speaking" : micEnabled ? "Ready" : "Mic off"}
        </span>
      </div>

      <button
        type="button"
        onClick={() => setIsCallCollapsed((v) => !v)}
        className="h-7 px-2.5 rounded-[var(--radius-control)] border border-hairline bg-surface text-ink-muted text-xs hover:bg-raised hover:text-ink transition-colors"
        title={isCallCollapsed ? "Expand call" : "Collapse call"}
      >
        {isCallCollapsed ? "Expand" : "Collapse"}
      </button>
    </div>
  );
}
