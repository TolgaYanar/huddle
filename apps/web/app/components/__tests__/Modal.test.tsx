import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

import { Modal } from "../Modal";

describe("Modal", () => {
  it("renders nothing when closed", () => {
    render(
      <Modal open={false} onClose={() => {}}>
        <div>body</div>
      </Modal>,
    );
    expect(screen.queryByText("body")).toBeNull();
  });

  it("renders children when open with dialog role", () => {
    render(
      <Modal open onClose={() => {}}>
        <div>body</div>
      </Modal>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("wires aria-modal and aria-labelledby/describedBy", () => {
    render(
      <Modal open onClose={() => {}} labelledBy="t" describedBy="d">
        <h2 id="t">Title</h2>
        <p id="d">Body</p>
      </Modal>,
    );
    const dlg = screen.getByRole("dialog");
    expect(dlg).toHaveAttribute("aria-modal", "true");
    expect(dlg).toHaveAttribute("aria-labelledby", "t");
    expect(dlg).toHaveAttribute("aria-describedby", "d");
  });

  it("calls onClose on Escape by default", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose}>
        <div>body</div>
      </Modal>,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not call onClose on Escape when closeOnEscape is false", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} closeOnEscape={false}>
        <div>body</div>
      </Modal>,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose}>
        <div>body</div>
      </Modal>,
    );
    fireEvent.click(screen.getByTestId("modal-backdrop"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not bubble panel clicks to the backdrop", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose}>
        <button type="button">click me</button>
      </Modal>,
    );
    fireEvent.click(screen.getByRole("button", { name: "click me" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not call onClose on backdrop click when closeOnBackdrop is false", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} closeOnBackdrop={false}>
        <div>body</div>
      </Modal>,
    );
    fireEvent.click(screen.getByTestId("modal-backdrop"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("moves focus into the dialog and restores it when closed", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    const { rerender } = render(
      <Modal open onClose={() => {}}>
        <button type="button">first action</button>
      </Modal>,
    );

    expect(screen.getByRole("button", { name: "first action" })).toHaveFocus();

    rerender(
      <Modal open={false} onClose={() => {}}>
        <button type="button">first action</button>
      </Modal>,
    );
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it("wraps Tab and Shift+Tab within the dialog", () => {
    render(
      <Modal open onClose={() => {}}>
        <button type="button">first</button>
        <button type="button">last</button>
      </Modal>,
    );
    const first = screen.getByRole("button", { name: "first" });
    const last = screen.getByRole("button", { name: "last" });

    last.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(first).toHaveFocus();

    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("focuses and traps on the panel when it has no interactive content", () => {
    render(
      <Modal open onClose={() => {}}>
        <p>plain content</p>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");

    expect(dialog).toHaveFocus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(dialog).toHaveFocus();
  });
});

describe("Modal background and visibility handling", () => {
  it("locks background scrolling while open and restores it on close", () => {
    document.body.style.overflow = "auto";

    const { rerender } = render(
      <Modal open onClose={() => {}}>
        <button type="button">Inside</button>
      </Modal>,
    );
    expect(document.body.style.overflow).toBe("hidden");

    rerender(
      <Modal open={false} onClose={() => {}}>
        <button type="button">Inside</button>
      </Modal>,
    );
    expect(document.body.style.overflow).toBe("auto");

    document.body.style.overflow = "";
  });

  it("treats a display:none control as outside the trap boundary", async () => {
    const user = userEvent.setup();
    render(
      <Modal open onClose={() => {}}>
        <button type="button">First</button>
        <button type="button">Last</button>
        <button type="button" style={{ display: "none" }}>
          Offscreen
        </button>
      </Modal>,
    );

    // The hidden control sits after "Last" in the DOM. If it were counted as
    // focusable the trap would treat it as the boundary, so tabbing off "Last"
    // would walk out of the dialog instead of wrapping.
    screen.getByRole("button", { name: "Last" }).focus();
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "First" }),
    );
  });

  it("treats a visibility:hidden control as outside the trap boundary", async () => {
    const user = userEvent.setup();
    render(
      <Modal open onClose={() => {}}>
        <button type="button" style={{ visibility: "hidden" }}>
          Invisible
        </button>
        <button type="button">First</button>
        <button type="button">Last</button>
      </Modal>,
    );

    screen.getByRole("button", { name: "First" }).focus();
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Last" }),
    );
  });
});
