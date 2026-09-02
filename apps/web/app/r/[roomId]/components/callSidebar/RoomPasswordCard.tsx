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
    <div className="rounded-[var(--radius-panel)] border border-hairline bg-sunken p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-ink font-medium">Room password</div>
        <div className="text-xs text-ink-muted">
          {hasRoomPassword ? "On" : "Off"}
        </div>
      </div>

      {isHost && (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPasswordEditor((v) => !v)}
            className="h-8 px-3 rounded-[var(--radius-control)] border border-hairline bg-surface text-ink text-xs font-medium hover:bg-raised transition-colors"
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
              className="h-8 px-3 rounded-[var(--radius-control)] border border-hairline bg-surface text-ink text-xs font-medium hover:bg-raised transition-colors"
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
            className="h-9 flex-1 rounded-[var(--radius-control)] border border-hairline bg-surface px-3 text-sm text-ink placeholder:text-ink-faint outline-none focus:ring-2 focus:ring-white/10"
          />
          <button
            type="button"
            onClick={() => {
              onSetRoomPassword(passwordDraft.trim());
              setPasswordDraft("");
              setShowPasswordEditor(false);
            }}
            className="h-9 px-4 rounded-[var(--radius-control)] border border-hairline bg-surface text-ink text-sm font-medium hover:bg-raised transition-colors"
            disabled={!passwordDraft.trim()}
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
}
