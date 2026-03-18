import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PasswordToggleButton } from "../PasswordToggleButton";

describe("PasswordToggleButton", () => {
  it("renders with aria-label 'Show password' when show=false", () => {
    render(<PasswordToggleButton show={false} onToggle={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Show password" })).toBeInTheDocument();
  });

  it("renders with aria-label 'Hide password' when show=true", () => {
    render(<PasswordToggleButton show={true} onToggle={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Hide password" })).toBeInTheDocument();
  });

  it("calls onToggle when clicked", () => {
    const onToggle = vi.fn();
    render(<PasswordToggleButton show={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("has type='button' to avoid form submission", () => {
    render(<PasswordToggleButton show={false} onToggle={vi.fn()} />);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });
});
