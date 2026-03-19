import React from "react";

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked ? "true" : "false"}
      onClick={onChange}
      className="flex items-center justify-between w-full gap-3 text-left hover:bg-white/5 rounded-lg px-1 py-1 transition-colors"
    >
      <div className="min-w-0">
        <span className="text-xs text-slate-300">{label}</span>
        {description && (
          <span className="block text-[10px] text-slate-500 leading-tight">{description}</span>
        )}
      </div>
      <div
        className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-sky-500" : "bg-white/10"
        }`}
      >
        <span
          className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-3.5" : "translate-x-0.5"
          }`}
        />
      </div>
    </button>
  );
}

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
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 flex flex-col gap-0.5">
      <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wide mb-1">
        Audio
      </div>
      <Toggle
        checked={echoCancellationEnabled}
        onChange={() => setEchoCancellationEnabled((v) => !v)}
        label="Echo cancellation"
        description="Reduces speaker echo"
      />
      <Toggle
        checked={noiseSuppressionEnabled}
        onChange={() => setNoiseSuppressionEnabled((v) => !v)}
        label="Noise suppression"
        description="Filters background noise"
      />
      <Toggle
        checked={autoGainControlEnabled}
        onChange={() => setAutoGainControlEnabled((v) => !v)}
        label="Auto gain"
        description="Normalizes mic volume"
      />
    </div>
  );
}
