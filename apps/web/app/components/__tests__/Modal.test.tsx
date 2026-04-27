import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
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
    fireEvent.click(screen.getByRole("dialog"));
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
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });
});
