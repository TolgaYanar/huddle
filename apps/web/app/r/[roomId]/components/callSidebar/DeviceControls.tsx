import React from "react";

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
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setMicEnabled((v) => !v)}
        className={`h-9 px-3 rounded-xl border border-white/10 text-sm font-medium transition-colors ${
          micEnabled
            ? "bg-sky-500/15 text-sky-200"
            : "bg-white/5 text-slate-200 hover:bg-white/10"
        }`}
      >
        {micEnabled ? "🎙 Mic on" : "🎙 Mic"}
      </button>
      <button
        type="button"
        onClick={() => setCamEnabled((v) => !v)}
        className={`h-9 px-3 rounded-xl border border-white/10 text-sm font-medium transition-colors ${
          camEnabled
            ? "bg-indigo-500/15 text-indigo-200"
            : "bg-white/5 text-slate-200 hover:bg-white/10"
        }`}
      >
        {camEnabled ? "📷 Webcam on" : "📷 Webcam"}
      </button>
      <button
        type="button"
        onClick={() => setScreenEnabled((v) => !v)}
        className={`h-9 px-3 rounded-xl border border-white/10 text-sm font-medium transition-colors ${
          screenEnabled
            ? "bg-rose-500/15 text-rose-200"
            : "bg-white/5 text-slate-200 hover:bg-white/10"
        }`}
      >
        {screenEnabled ? "🖥 Sharing" : "🖥 Share screen"}
      </button>

      <button
        type="button"
        onClick={() => {
          setPushToTalkEnabled((v) => !v);
          stopPushToTalkTransmit();
        }}
        disabled={!micEnabled}
        className={`h-9 px-3 rounded-xl border border-white/10 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          pushToTalkEnabled
            ? "bg-amber-500/15 text-amber-200"
            : "bg-white/5 text-slate-200 hover:bg-white/10"
        }`}
        title={
          micEnabled
            ? `Hold ${pushToTalkBindingLabel} to transmit`
            : "Enable mic first"
        }
      >
        {pushToTalkEnabled
          ? pushToTalkDown
            ? `␣ Push-to-talk (${pushToTalkBindingLabel})`
            : `␣ Push-to-talk on (${pushToTalkBindingLabel})`
          : `␣ Push-to-talk (${pushToTalkBindingLabel})`}
      </button>

      <button
        type="button"
        onClick={() => {
          setIsRebindingPushToTalkKey((v) => !v);
        }}
        disabled={!pushToTalkEnabled}
        className={`h-9 px-3 rounded-xl border border-white/10 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          isRebindingPushToTalkKey
            ? "bg-amber-500/15 text-amber-200"
            : "bg-white/5 text-slate-200 hover:bg-white/10"
        }`}
        title={
          pushToTalkEnabled
            ? isRebindingPushToTalkKey
              ? "Press a key or mouse button (Esc to cancel)"
              : "Change push-to-talk binding"
            : "Enable push-to-talk first"
        }
      >
        {isRebindingPushToTalkKey
          ? "Press a key or mouse…"
          : `Change bind (${pushToTalkBindingLabel})`}
      </button>
    </div>
  );
}
