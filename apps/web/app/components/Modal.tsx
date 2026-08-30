"use client";

import React from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function isVisible(element: HTMLElement) {
  if (element.hidden) return false;
  if (element.closest('[hidden], [aria-hidden="true"]')) return false;
  // Tailwind's responsive `hidden` utility is display:none from a class, which
  // no attribute check can see. Without this a keyboard user could tab onto a
  // control that is not on screen at the current breakpoint.
  const view = element.ownerDocument?.defaultView;
  if (!view?.getComputedStyle) return true;
  const style = view.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(isVisible);
}

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
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const panel = panelRef.current;
    if (panel) {
      const preferred = panel.querySelector<HTMLElement>("[autofocus]");
      const firstFocusable = getFocusableElements(panel)[0];
      (preferred || firstFocusable || panel).focus();
    }

    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open]);

  // Lock background scrolling while a dialog is up. Without this the page
  // behind the overlay still scrolls under a wheel or trackpad gesture, which
  // on mobile silently moves the content the user returns to after closing.
  React.useEffect(() => {
    if (!open) return;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = previousOverflow;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && closeOnEscape) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusable = getFocusableElements(panel);
      if (focusable.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeOnEscape, onClose]);

  if (!open) return null;

  return (
    <div
      data-testid="modal-backdrop"
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={panelClassName}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
