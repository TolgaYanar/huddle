"use client";

import React from "react";

interface ModalProps {
  /** Whether the modal is shown. */
  open: boolean;
  /** Called when the user dismisses via Escape, backdrop click, or the close action. */
  onClose: () => void;
  /** Optional id to wire up aria-labelledby — should match the heading id inside `children`. */
  labelledBy?: string;
  /** Optional id to wire up aria-describedby. */
  describedBy?: string;
  /** When true, clicking the backdrop dismisses the modal. Defaults to true. */
  closeOnBackdrop?: boolean;
  /** When true, pressing Escape dismisses the modal. Defaults to true. */
  closeOnEscape?: boolean;
  /** Extra classes for the panel — width, padding, etc. */
  panelClassName?: string;
  children: React.ReactNode;
}

/**
 * Accessible modal shell. Centralizes the keyboard, focus, and ARIA boilerplate
 * shared by every dialog in the room view. Caller owns the heading and content.
 */
export function Modal({
  open,
  onClose,
  labelledBy,
  describedBy,
  closeOnBackdrop = true,
  closeOnEscape = true,
  panelClassName = "max-w-lg w-full rounded-2xl border border-white/10 bg-slate-900 shadow-2xl",
  children,
}: ModalProps) {
  React.useEffect(() => {
    if (!open || !closeOnEscape) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeOnEscape, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className={panelClassName}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
