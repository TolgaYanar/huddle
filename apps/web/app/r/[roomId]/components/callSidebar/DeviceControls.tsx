import React from "react";

import type {
  MediaDeviceErrors,
  MediaDeviceKind,
  MediaDevicePending,
} from "../../hooks/useMediaTracks";
import type { SelectableMediaDevice } from "../../hooks/useMediaDevices";

function DeviceSelect({
  label,
  value,
  devices,
  onChange,
}: {
  label: string;
  value: string;
  devices: SelectableMediaDevice[];
  onChange: (deviceId: string) => void;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-ink-faint">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 min-w-0 w-full rounded-[var(--radius-control)] border border-hairline bg-sunken px-2 text-xs text-ink outline-none focus:border-accent"
      >
        <option value="">System default</option>
        {devices.map((device, index) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label || `${label} ${index + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

function MicOffIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
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
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15.5 10.5 19 7v10l-3.5-3.5" />
      <rect x="2" y="7" width="13" height="10" rx="2" />
    </svg>
  );
}

function CamOffIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="2" y1="2" x2="22" y2="22" />
      <path d="M10.66 6H13a2 2 0 0 1 2 2v2.34l1 1L19 7v10" />
      <path d="M14.97 14.97A2 2 0 0 1 13 17H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h.09" />
    </svg>
  );
}

function ScreenIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
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
  mediaErrors: MediaDeviceErrors;
  mediaPending: MediaDevicePending;
  clearMediaError: (kind: MediaDeviceKind) => void;
  audioInputs: SelectableMediaDevice[];
  videoInputs: SelectableMediaDevice[];
  audioOutputs: SelectableMediaDevice[];
  audioInputId: string;
  setAudioInputId: (deviceId: string) => void;
  videoInputId: string;
  setVideoInputId: (deviceId: string) => void;
  audioOutputId: string;
  setAudioOutputId: (deviceId: string) => void;
  outputSelectionSupported: boolean;
  devicesRefreshing: boolean;
  deviceInventoryError: string | null;
  refreshDevices: () => Promise<SelectableMediaDevice[]>;

  pushToTalkEnabled: boolean;
  setPushToTalkEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  pushToTalkDown: boolean;
  pushToTalkBindingLabel: string;
  stopPushToTalkTransmit: () => void;
  closePushToTalkGate: () => void;

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
    mediaErrors,
    mediaPending,
    clearMediaError,
    audioInputs,
    videoInputs,
    audioOutputs,
    audioInputId,
    setAudioInputId,
    videoInputId,
    setVideoInputId,
    audioOutputId,
    setAudioOutputId,
    outputSelectionSupported,
    devicesRefreshing,
    deviceInventoryError,
    refreshDevices,
    pushToTalkEnabled,
    setPushToTalkEnabled,
    pushToTalkDown,
    pushToTalkBindingLabel,
    stopPushToTalkTransmit,
    closePushToTalkGate,
    isRebindingPushToTalkKey,
    setIsRebindingPushToTalkKey,
  } = props;

  return (
    <div className="flex flex-col gap-2">
      {/* Primary media toggles */}
      <div className="grid grid-cols-3 gap-1.5">
        <button
          type="button"
          onClick={() => {
            clearMediaError("mic");
            setMicEnabled((v) => !v);
          }}
          disabled={mediaPending.mic}
          aria-pressed={micEnabled ? "true" : "false"}
          aria-label={micEnabled ? "Turn off microphone" : "Turn on microphone"}
          className={`flex flex-col items-center justify-center gap-1 py-2.5 rounded-[var(--radius-control)] border text-xs font-medium transition-colors disabled:opacity-60 disabled:cursor-wait ${
            micEnabled
              ? "bg-accent-soft border-accent text-accent"
              : "bg-sunken border-hairline text-ink-muted hover:bg-surface hover:text-ink"
          }`}
          title={micEnabled ? "Turn off microphone" : "Turn on microphone"}
        >
          {micEnabled ? (
            <MicIcon className="w-4 h-4" />
          ) : (
            <MicOffIcon className="w-4 h-4" />
          )}
          <span>
            {mediaPending.mic ? "Starting…" : micEnabled ? "Mic on" : "Mic"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            clearMediaError("cam");
            setCamEnabled((v) => !v);
          }}
          disabled={mediaPending.cam}
          aria-pressed={camEnabled ? "true" : "false"}
          aria-label={camEnabled ? "Turn off camera" : "Turn on camera"}
          className={`flex flex-col items-center justify-center gap-1 py-2.5 rounded-[var(--radius-control)] border text-xs font-medium transition-colors disabled:opacity-60 disabled:cursor-wait ${
            camEnabled
              ? "bg-accent-soft border-accent text-accent"
              : "bg-sunken border-hairline text-ink-muted hover:bg-surface hover:text-ink"
          }`}
          title={camEnabled ? "Turn off camera" : "Turn on camera"}
        >
          {camEnabled ? (
            <CamIcon className="w-4 h-4" />
          ) : (
            <CamOffIcon className="w-4 h-4" />
          )}
          <span>
            {mediaPending.cam ? "Starting…" : camEnabled ? "Cam on" : "Camera"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            clearMediaError("screen");
            setScreenEnabled((v) => !v);
          }}
          disabled={mediaPending.screen}
          aria-pressed={screenEnabled ? "true" : "false"}
          aria-label={screenEnabled ? "Stop sharing screen" : "Share screen"}
          className={`flex flex-col items-center justify-center gap-1 py-2.5 rounded-[var(--radius-control)] border text-xs font-medium transition-colors disabled:opacity-60 disabled:cursor-wait ${
            screenEnabled
              ? "bg-negative-soft border-negative text-negative"
              : "bg-sunken border-hairline text-ink-muted hover:bg-surface hover:text-ink"
          }`}
          title={screenEnabled ? "Stop sharing screen" : "Share screen"}
        >
          <ScreenIcon className="w-4 h-4" />
          <span>
            {mediaPending.screen
              ? "Starting…"
              : screenEnabled
                ? "Sharing"
                : "Screen"}
          </span>
        </button>
      </div>

      {Object.entries(mediaErrors).map(([kind, message]) => (
        <div
          key={kind}
          role="alert"
          className="flex items-start justify-between gap-2 rounded-[var(--radius-control)] border border-negative/40 bg-negative-soft px-3 py-2 text-xs text-negative"
        >
          <span>{message}</span>
          <button
            type="button"
            onClick={() => clearMediaError(kind as MediaDeviceKind)}
            className="shrink-0 font-semibold hover:brightness-110"
            aria-label="Dismiss media error"
          >
            ×
          </button>
        </div>
      ))}

      <details className="rounded-[var(--radius-control)] border border-hairline bg-sunken px-3 py-2">
        <summary className="cursor-pointer select-none text-xs font-medium text-ink-muted hover:text-ink">
          Audio &amp; video devices
        </summary>
        <div className="mt-3 grid gap-3">
          <DeviceSelect
            label="Microphone"
            value={audioInputId}
            devices={audioInputs}
            onChange={setAudioInputId}
          />
          <DeviceSelect
            label="Camera"
            value={videoInputId}
            devices={videoInputs}
            onChange={setVideoInputId}
          />
          {outputSelectionSupported && (
            <DeviceSelect
              label="Speaker"
              value={audioOutputId}
              devices={audioOutputs}
              onChange={setAudioOutputId}
            />
          )}
          {deviceInventoryError && (
            <p role="status" className="text-xs leading-relaxed text-negative">
              {deviceInventoryError}
            </p>
          )}
          <button
            type="button"
            onClick={() => void refreshDevices()}
            disabled={devicesRefreshing}
            className="h-8 justify-self-start rounded-[var(--radius-control)] border border-hairline bg-surface px-3 text-xs font-medium text-ink-muted hover:bg-raised hover:text-ink disabled:cursor-wait disabled:opacity-60"
          >
            {devicesRefreshing ? "Refreshing…" : "Refresh devices"}
          </button>
        </div>
      </details>

      {/* Push-to-talk */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-pressed={pushToTalkEnabled}
          onClick={() => {
            if (pushToTalkEnabled) stopPushToTalkTransmit();
            else closePushToTalkGate();
            setPushToTalkEnabled(!pushToTalkEnabled);
          }}
          disabled={!micEnabled}
          className={`flex-1 h-8 px-3 rounded-[var(--radius-control)] border text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            pushToTalkEnabled
              ? pushToTalkDown
                ? "bg-accent-soft border-accent text-accent"
                : "bg-accent-tint border-accent text-accent"
              : "bg-sunken border-hairline text-ink-muted hover:bg-surface hover:text-ink"
          }`}
          title={
            micEnabled
              ? `Hold ${pushToTalkBindingLabel} to transmit`
              : "Enable mic first"
          }
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
            aria-pressed={isRebindingPushToTalkKey}
            onClick={() => setIsRebindingPushToTalkKey((v) => !v)}
            className={`h-8 px-2.5 rounded-[var(--radius-control)] border text-xs font-medium transition-colors ${
              isRebindingPushToTalkKey
                ? "bg-accent-tint border-accent text-accent"
                : "bg-sunken border-hairline text-ink-muted hover:bg-surface hover:text-ink"
            }`}
            title={
              isRebindingPushToTalkKey
                ? "Press a key or mouse button (Esc to cancel)"
                : "Change key binding"
            }
          >
            {isRebindingPushToTalkKey ? "Listening…" : "Rebind"}
          </button>
        )}
      </div>
    </div>
  );
}
