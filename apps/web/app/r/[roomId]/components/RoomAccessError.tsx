import React from "react";
import Link from "next/link";

interface RoomAccessErrorProps {
  error: string | null;
}

export function RoomAccessError({ error }: RoomAccessErrorProps) {
  if (!error) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-6">
      <div className="max-w-md w-full rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="text-lg font-semibold">Room access</div>
        <div className="text-sm text-slate-300 mt-2">{error}</div>
        <div className="mt-5 flex items-center gap-3">
          <Link
            href="/"
            className="h-9 px-4 inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-100 text-sm font-medium hover:bg-white/10 transition-colors"
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
            className="h-9 px-4 inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-100 text-sm font-medium hover:bg-white/10 transition-colors"
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}
