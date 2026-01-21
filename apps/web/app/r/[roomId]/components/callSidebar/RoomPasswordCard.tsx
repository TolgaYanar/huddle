import React from "react";

export function RoomPasswordCard(props: {
  isHost: boolean;
  hasRoomPassword: boolean;
  onSetRoomPassword: (password: string) => void;
  showPasswordEditor: boolean;
  setShowPasswordEditor: React.Dispatch<React.SetStateAction<boolean>>;
  passwordDraft: string;
  setPasswordDraft: React.Dispatch<React.SetStateAction<string>>;
}) {
  const {
    isHost,
    hasRoomPassword,
    onSetRoomPassword,
    showPasswordEditor,
    setShowPasswordEditor,
    passwordDraft,
    setPasswordDraft,
  } = props;

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-slate-100 font-medium">Room password</div>
        <div className="text-xs text-slate-300">
          {hasRoomPassword ? "On" : "Off"}
        </div>
      </div>

      {isHost && (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPasswordEditor((v) => !v)}
            className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 text-slate-200 text-xs font-medium hover:bg-white/10 transition-colors"
          >
            {showPasswordEditor ? "Close" : hasRoomPassword ? "Change" : "Set"}
          </button>
          {hasRoomPassword && (
            <button
              type="button"
              onClick={() => {
                onSetRoomPassword("");
                setPasswordDraft("");
              }}
              className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 text-slate-200 text-xs font-medium hover:bg-white/10 transition-colors"
              title="Clear room password"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {isHost && showPasswordEditor && (
        <div className="mt-3 flex items-center gap-2">
          <input
            value={passwordDraft}
            onChange={(e) => setPasswordDraft(e.target.value)}
            placeholder={hasRoomPassword ? "New password" : "Set a password"}
            type="password"
            className="h-9 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-white/10"
          />
          <button
            type="button"
            onClick={() => {
              onSetRoomPassword(passwordDraft.trim());
              setPasswordDraft("");
              setShowPasswordEditor(false);
            }}
            className="h-9 px-4 rounded-xl border border-white/10 bg-white/5 text-slate-100 text-sm font-medium hover:bg-white/10 transition-colors"
            disabled={!passwordDraft.trim()}
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
}
