import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ProgressBar } from "../ProgressBar";

describe("ProgressBar accessibility", () => {
  it("exposes slider value and supports standard seek keys", async () => {
    const user = userEvent.setup();
    const onSeek = vi.fn();
    render(
      <ProgressBar
        disabled={false}
        canSeek
        currentTime={30}
        duration={120}
        onSeek={onSeek}
      />,
    );
    const slider = screen.getByRole("slider", { name: "Video progress" });

    expect(slider).toHaveAttribute("aria-valuemin", "0");
    expect(slider).toHaveAttribute("aria-valuemax", "120");
    expect(slider).toHaveAttribute("aria-valuenow", "30");
    expect(slider).toHaveAttribute("aria-valuetext", "0:30 of 2:00");

    slider.focus();
    await user.keyboard("{ArrowRight}{End}{Home}");

    expect(onSeek).toHaveBeenNthCalledWith(1, 35);
    expect(onSeek).toHaveBeenNthCalledWith(2, 120);
    expect(onSeek).toHaveBeenNthCalledWith(3, 0);
  });

  it("maps pointer position to duration", () => {
    const onSeek = vi.fn();
    render(
      <ProgressBar
        disabled={false}
        canSeek
        currentTime={0}
        duration={120}
        onSeek={onSeek}
      />,
    );
    const slider = screen.getByRole("slider", { name: "Video progress" });
    vi.spyOn(slider, "getBoundingClientRect").mockReturnValue({
      left: 10,
      width: 200,
      top: 0,
      right: 210,
      bottom: 0,
      height: 0,
      x: 10,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.click(slider, { clientX: 110 });

    expect(onSeek).toHaveBeenCalledWith(60);
  });

  it("is removed from the tab order and ignores input when seeking is disabled", async () => {
    const user = userEvent.setup();
    const onSeek = vi.fn();
    render(
      <ProgressBar
        disabled
        canSeek
        currentTime={30}
        duration={120}
        onSeek={onSeek}
      />,
    );
    const slider = screen.getByRole("slider", { name: "Video progress" });

    expect(slider).toHaveAttribute("aria-disabled", "true");
    expect(slider).toHaveAttribute("tabindex", "-1");
    slider.focus();
    await user.keyboard("{ArrowRight}");
    fireEvent.click(slider, { clientX: 50 });
    expect(onSeek).not.toHaveBeenCalled();
  });
});

describe("ProgressBar rendering cost", () => {
  it("positions the fill inline instead of regenerating a stylesheet", () => {
    // The fill/scrubber positions used to live in a global <style> block that
    // was rewritten on every progress tick (~2x/second during playback) and on
    // every mousemove, forcing a document-wide style recalculation. The class
    // names were unscoped too, so two mounted bars would fight over them.
    const { container, rerender } = render(
      <ProgressBar
        disabled={false}
        canSeek
        currentTime={30}
        duration={120}
        onSeek={() => {}}
      />,
    );

    expect(container.querySelectorAll("style")).toHaveLength(0);

    const fill = container.querySelector<HTMLElement>('[style*="width"]');
    expect(fill?.style.width).toBe("25%");

    rerender(
      <ProgressBar
        disabled={false}
        canSeek
        currentTime={60}
        duration={120}
        onSeek={() => {}}
      />,
    );

    expect(container.querySelectorAll("style")).toHaveLength(0);
    expect(
      container.querySelector<HTMLElement>('[style*="width"]')?.style.width,
    ).toBe("50%");
  });

  it("keeps positioning classes off the global namespace", () => {
    const { container } = render(
      <ProgressBar
        disabled={false}
        canSeek
        currentTime={10}
        duration={100}
        onSeek={() => {}}
      />,
    );

    for (const legacyClass of ["progressFill", "hoverTooltip", "scrubber"]) {
      expect(container.querySelector(`.${legacyClass}`)).toBeNull();
    }
  });
});
