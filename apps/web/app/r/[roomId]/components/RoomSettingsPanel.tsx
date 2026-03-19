"use client";

import React from "react";

export type RoomSettingsPanelProps = {
  isOpen: boolean;
  onClose: () => void;

  roomName: string | null;
  onSetRoomName: (name: string) => void;

  hasRoomPassword: boolean;
  onSetRoomPassword: (password: string) => void;

  participants: string[];
  usernamesById: Record<string, string | null>;
  userId: string;
  hostId: string | null;
  onKickUser: (targetId: string) => void;
  onTransferHost: (targetId: string) => void;
};

export function RoomSettingsPanel({
  isOpen,
  onClose,
  roomName,
  onSetRoomName,
  hasRoomPassword,
  onSetRoomPassword,
  participants,
  usernamesById,
  userId,
  hostId,
  onKickUser,
  onTransferHost,
}: RoomSettingsPanelProps) {
  const [nameInput, setNameInput] = React.useState(roomName ?? "");
  const [passwordInput, setPasswordInput] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [confirmKick, setConfirmKick] = React.useState<string | null>(null);
  const [confirmTransfer, setConfirmTransfer] = React.useState<string | null>(null);

  // Sync name input when panel opens or roomName changes externally.
  React.useEffect(() => {
    setNameInput(roomName ?? "");
  }, [roomName, isOpen]);

  if (!isOpen) return null;

  const getDisplayName = (id: string) =>
    usernamesById[id] ?? id.slice(0, 6);

  const others = participants.filter((id) => id !== userId);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-80 max-w-full flex flex-col bg-slate-900/95 border-l border-white/10 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <span className="text-sm font-semibold text-slate-100">Room settings</span>
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">

          {/* Room name */}
          <section>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Room name</h3>
            <div className="flex gap-2">
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onSetRoomName(nameInput.trim());
                  }
                }}
                maxLength={40}
                placeholder="No name set"
                className="flex-1 h-9 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
              <button
                type="button"
                onClick={() => onSetRoomName(nameInput.trim())}
                className="h-9 px-3 rounded-xl border border-white/10 bg-indigo-500/20 text-indigo-200 text-sm font-medium hover:bg-indigo-500/30 transition-colors"
              >
                Save
              </button>
            </div>
            {roomName && (
              <button
                type="button"
                onClick={() => {
                  onSetRoomName("");
                  setNameInput("");
                }}
                className="mt-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                Clear name
              </button>
            )}
          </section>

          <div className="border-t border-white/10" />

          {/* Password */}
          <section>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Password
              <span className={`ml-2 font-normal normal-case tracking-normal ${hasRoomPassword ? "text-amber-300" : "text-slate-500"}`}>
                {hasRoomPassword ? "Enabled" : "Disabled"}
              </span>
            </h3>
            <div className="flex gap-2">
              <input
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && passwordInput.trim()) {
                    onSetRoomPassword(passwordInput.trim());
                    setPasswordInput("");
                  }
                }}
                type={showPassword ? "text" : "password"}
                placeholder={hasRoomPassword ? "New password…" : "Set a password…"}
                className="flex-1 h-9 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="h-9 w-9 rounded-xl border border-white/10 bg-white/5 text-slate-400 hover:text-slate-200 text-xs transition-colors"
                title={showPassword ? "Hide" : "Show"}
              >
                {showPassword ? "●" : "○"}
              </button>
              <button
                type="button"
                disabled={!passwordInput.trim()}
                onClick={() => {
                  onSetRoomPassword(passwordInput.trim());
                  setPasswordInput("");
                }}
                className="h-9 px-3 rounded-xl border border-white/10 bg-indigo-500/20 text-indigo-200 text-sm font-medium hover:bg-indigo-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Set
              </button>
            </div>
            {hasRoomPassword && (
              <button
                type="button"
                onClick={() => onSetRoomPassword("")}
                className="mt-1.5 text-xs text-rose-400 hover:text-rose-300 transition-colors"
              >
                Remove password
              </button>
            )}
          </section>

          <div className="border-t border-white/10" />

          {/* Participants */}
          <section>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Participants
              <span className="ml-2 font-normal normal-case tracking-normal text-slate-500">
                {others.length + 1} in room
              </span>
            </h3>
            <ul className="flex flex-col gap-1">
              {/* Self */}
              <li className="flex items-center gap-2 h-9 px-3 rounded-xl bg-white/5">
                <span className="flex-1 text-sm text-slate-200 truncate">
                  {getDisplayName(userId)}
                </span>
                <span className="text-xs text-indigo-300 font-medium">You · Host</span>
              </li>

              {others.map((id) => (
                <li key={id} className="flex items-center gap-2 h-9 px-3 rounded-xl bg-white/5">
                  <span className="flex-1 text-sm text-slate-200 truncate">
                    {getDisplayName(id)}
                    {id === hostId && (
                      <span className="ml-1.5 text-xs text-indigo-300">Host</span>
                    )}
                  </span>

                  {confirmTransfer === id ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs text-slate-400">Transfer?</span>
                      <button
                        type="button"
                        onClick={() => {
                          onTransferHost(id);
                          setConfirmTransfer(null);
                          onClose();
                        }}
                        className="text-xs text-indigo-300 hover:text-indigo-200 font-medium"
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmTransfer(null)}
                        className="text-xs text-slate-500 hover:text-slate-300"
                      >
                        No
                      </button>
                    </div>
                  ) : confirmKick === id ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs text-slate-400">Kick?</span>
                      <button
                        type="button"
                        onClick={() => {
                          onKickUser(id);
                          setConfirmKick(null);
                        }}
                        className="text-xs text-rose-400 hover:text-rose-300 font-medium"
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmKick(null)}
                        className="text-xs text-slate-500 hover:text-slate-300"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmKick(null);
                          setConfirmTransfer(id);
                        }}
                        className="h-6 px-2 rounded-md text-xs text-indigo-300 hover:bg-indigo-500/20 transition-colors"
                        title="Make host"
                      >
                        Host
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmTransfer(null);
                          setConfirmKick(id);
                        }}
                        className="h-6 px-2 rounded-md text-xs text-rose-400 hover:bg-rose-500/20 transition-colors"
                        title="Kick"
                      >
                        Kick
                      </button>
                    </div>
                  )}
                </li>
              ))}

              {others.length === 0 && (
                <li className="text-xs text-slate-500 px-3 py-2">No other participants</li>
              )}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
