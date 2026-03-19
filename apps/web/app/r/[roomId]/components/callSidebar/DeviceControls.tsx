import React from "react";

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

function MicOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <line x1="2" y1="2" x2="22" y2="22" />
      <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12" />
      <path d="M5 10a7 7 0 0 0 11.9 5.1" />
      <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

function CamIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15.5 10.5 19 7v10l-3.5-3.5" />
      <rect x="2" y="7" width="13" height="10" rx="2" />
    </svg>
  );
}

function CamOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <line x1="2" y1="2" x2="22" y2="22" />
      <path d="M10.66 6H13a2 2 0 0 1 2 2v2.34l1 1L19 7v10" />
      <path d="M14.97 14.97A2 2 0 0 1 13 17H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h.09" />
    </svg>
  );
}

function ScreenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

export function DeviceControls(props: {
  micEnabled: boolean;
  setMicEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  camEnabled: boolean;
  setCamEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  screenEnabled: boolean;
  setScreenEnabled: React.Dispatch<React.SetStateAction<boolean>>;

  pushToTalkEnabled: boolean;
  setPushToTalkEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  pushToTalkDown: boolean;
  pushToTalkBindingLabel: string;
  stopPushToTalkTransmit: () => void;

  isRebindingPushToTalkKey: boolean;
  setIsRebindingPushToTalkKey: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const {
    micEnabled,
    setMicEnabled,
    camEnabled,
    setCamEnabled,
    screenEnabled,
    setScreenEnabled,
    pushToTalkEnabled,
    setPushToTalkEnabled,
    pushToTalkDown,
    pushToTalkBindingLabel,
    stopPushToTalkTransmit,
    isRebindingPushToTalkKey,
    setIsRebindingPushToTalkKey,
  } = props;

  return (
    <div className="flex flex-col gap-2">
      {/* Primary media toggles */}
      <div className="grid grid-cols-3 gap-1.5">
        <button
          type="button"
          onClick={() => setMicEnabled((v) => !v)}
          className={`flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-colors ${
            micEnabled
              ? "bg-sky-500/15 border-sky-500/30 text-sky-300"
              : "bg-black/20 border-white/10 text-slate-400 hover:bg-white/5 hover:text-slate-200"
          }`}
          title={micEnabled ? "Turn off microphone" : "Turn on microphone"}
        >
          {micEnabled ? (
            <MicIcon className="w-4 h-4" />
          ) : (
            <MicOffIcon className="w-4 h-4" />
          )}
          <span>{micEnabled ? "Mic on" : "Mic"}</span>
        </button>

        <button
          type="button"
          onClick={() => setCamEnabled((v) => !v)}
          className={`flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-colors ${
            camEnabled
              ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-300"
              : "bg-black/20 border-white/10 text-slate-400 hover:bg-white/5 hover:text-slate-200"
          }`}
          title={camEnabled ? "Turn off camera" : "Turn on camera"}
        >
          {camEnabled ? (
            <CamIcon className="w-4 h-4" />
          ) : (
            <CamOffIcon className="w-4 h-4" />
          )}
          <span>{camEnabled ? "Cam on" : "Camera"}</span>
        </button>

        <button
          type="button"
          onClick={() => setScreenEnabled((v) => !v)}
          className={`flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-colors ${
            screenEnabled
              ? "bg-rose-500/15 border-rose-500/30 text-rose-300"
              : "bg-black/20 border-white/10 text-slate-400 hover:bg-white/5 hover:text-slate-200"
          }`}
          title={screenEnabled ? "Stop sharing screen" : "Share screen"}
        >
          <ScreenIcon className="w-4 h-4" />
          <span>{screenEnabled ? "Sharing" : "Screen"}</span>
        </button>
      </div>

      {/* Push-to-talk */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            setPushToTalkEnabled((v) => !v);
            stopPushToTalkTransmit();
          }}
          disabled={!micEnabled}
          className={`flex-1 h-8 px-3 rounded-xl border text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            pushToTalkEnabled
              ? pushToTalkDown
                ? "bg-amber-500/30 border-amber-500/50 text-amber-200"
                : "bg-amber-500/15 border-amber-500/30 text-amber-300"
              : "bg-black/20 border-white/10 text-slate-400 hover:bg-white/5 hover:text-slate-200"
          }`}
          title={micEnabled ? `Hold ${pushToTalkBindingLabel} to transmit` : "Enable mic first"}
        >
          {pushToTalkEnabled
            ? pushToTalkDown
              ? `Transmitting (${pushToTalkBindingLabel})`
              : `PTT on · ${pushToTalkBindingLabel}`
            : `Push-to-talk`}
        </button>

        {pushToTalkEnabled && (
          <button
            type="button"
            onClick={() => setIsRebindingPushToTalkKey((v) => !v)}
            className={`h-8 px-2.5 rounded-xl border text-xs font-medium transition-colors ${
              isRebindingPushToTalkKey
                ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                : "bg-black/20 border-white/10 text-slate-400 hover:bg-white/5 hover:text-slate-200"
            }`}
            title={isRebindingPushToTalkKey ? "Press a key or mouse button (Esc to cancel)" : "Change key binding"}
          >
            {isRebindingPushToTalkKey ? "Listening…" : "Rebind"}
          </button>
        )}
      </div>
    </div>
  );
}
