import React from "react";
import Link from "next/link";

interface RoomAccessErrorProps {
  error: string | null;
}

export function RoomAccessError({ error }: RoomAccessErrorProps) {
  if (!error) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-ink p-6">
      <div className="max-w-md w-full rounded-[var(--radius-panel)] border border-hairline bg-surface p-6">
        <div className="text-lg font-semibold">Room access</div>
        <div className="text-sm text-ink-muted mt-2">{error}</div>
        <div className="mt-5 flex items-center gap-3">
          <Link
            href="/"
            className="h-9 px-4 inline-flex items-center justify-center rounded-[var(--radius-control)] border border-hairline bg-surface text-ink text-sm font-medium hover:bg-raised transition-colors"
          >
            Go home
          </Link>
          <button
            type="button"
            onClick={() => {
              try {
                window.location.reload();
              } catch {
                // ignore
              }
            }}
            className="h-9 px-4 inline-flex items-center justify-center rounded-[var(--radius-control)] border border-hairline bg-surface text-ink text-sm font-medium hover:bg-raised transition-colors"
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}
