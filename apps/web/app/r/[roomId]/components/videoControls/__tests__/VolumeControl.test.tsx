import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { VolumeControl } from "../VolumeControl";

function TestIcon() {
  return <span aria-hidden="true">volume</span>;
}

function renderVolumeControl(overrides: { canChangeVolume?: boolean } = {}) {
  const onToggleMute = vi.fn();
  const onChangeVolume = vi.fn();

  render(
    <>
      <VolumeControl
        canMute
        canChangeVolume={overrides.canChangeVolume ?? true}
        displayMuted={false}
        displayVolume={0.5}
        onToggleMute={onToggleMute}
        onChangeVolume={onChangeVolume}
        Icon={TestIcon}
      />
      <button type="button">Outside</button>
    </>,
  );

  return { onToggleMute, onChangeVolume };
}

describe("VolumeControl accessibility", () => {
  it("opens for keyboard focus and keeps the range in the tab order", async () => {
    const user = userEvent.setup();
    renderVolumeControl();
    const mute = screen.getByRole("button", { name: "Mute" });

    expect(screen.queryByRole("slider", { name: "Volume" })).toBeNull();
    await user.tab();
    expect(mute).toHaveFocus();

    const slider = screen.getByRole("slider", { name: "Volume" });
    await user.tab();
    expect(slider).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Outside" })).toHaveFocus();
    expect(screen.queryByRole("slider", { name: "Volume" })).toBeNull();
  });

  it("opens for touch and closes on an outside pointer", () => {
    renderVolumeControl();
    const mute = screen.getByRole("button", { name: "Mute" });

    fireEvent.pointerDown(mute, { pointerType: "touch" });
    expect(screen.getByRole("slider", { name: "Volume" })).toBeVisible();

    fireEvent.pointerDown(document.body, { pointerType: "touch" });
    expect(screen.queryByRole("slider", { name: "Volume" })).toBeNull();
  });

  it("forwards accessible range changes", async () => {
    const user = userEvent.setup();
    const { onChangeVolume } = renderVolumeControl();
    await user.tab();

    fireEvent.change(screen.getByRole("slider", { name: "Volume" }), {
      target: { value: "0.75" },
    });

    expect(onChangeVolume).toHaveBeenCalledWith(0.75);
  });
});
