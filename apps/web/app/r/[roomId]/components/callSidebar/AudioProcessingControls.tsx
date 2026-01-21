import React from "react";

export function AudioProcessingControls(props: {
  echoCancellationEnabled: boolean;
  setEchoCancellationEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  noiseSuppressionEnabled: boolean;
  setNoiseSuppressionEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  autoGainControlEnabled: boolean;
  setAutoGainControlEnabled: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const {
    echoCancellationEnabled,
    setEchoCancellationEnabled,
    noiseSuppressionEnabled,
    setNoiseSuppressionEnabled,
    autoGainControlEnabled,
    setAutoGainControlEnabled,
  } = props;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setEchoCancellationEnabled((v) => !v)}
        className={`h-9 px-3 rounded-xl border border-white/10 text-sm font-medium transition-colors ${
          echoCancellationEnabled
            ? "bg-white/5 text-slate-200 hover:bg-white/10"
            : "bg-white/5 text-slate-400 hover:bg-white/10"
        }`}
        title="Echo cancellation (may reduce speaker echo)"
      >
        {echoCancellationEnabled ? "🔁 Echo cancel" : "🔁 Echo off"}
      </button>

      <button
        type="button"
        onClick={() => setNoiseSuppressionEnabled((v) => !v)}
        className={`h-9 px-3 rounded-xl border border-white/10 text-sm font-medium transition-colors ${
          noiseSuppressionEnabled
            ? "bg-white/5 text-slate-200 hover:bg-white/10"
            : "bg-white/5 text-slate-400 hover:bg-white/10"
        }`}
        title="Noise suppression (may reduce background noise)"
      >
        {noiseSuppressionEnabled ? "🧹 Noise suppress" : "🧹 Noise off"}
      </button>

      <button
        type="button"
        onClick={() => setAutoGainControlEnabled((v) => !v)}
        className={`h-9 px-3 rounded-xl border border-white/10 text-sm font-medium transition-colors ${
          autoGainControlEnabled
            ? "bg-white/5 text-slate-200 hover:bg-white/10"
            : "bg-white/5 text-slate-400 hover:bg-white/10"
        }`}
        title="Auto gain control (may normalize mic volume)"
      >
        {autoGainControlEnabled ? "🎚 Auto gain" : "🎚 Gain off"}
      </button>
    </div>
  );
}
