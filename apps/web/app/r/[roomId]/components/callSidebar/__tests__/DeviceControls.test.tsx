import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DeviceControls } from "../DeviceControls";

function renderControls(overrides: Record<string, unknown> = {}) {
  const closePushToTalkGate = vi.fn();
  const stopPushToTalkTransmit = vi.fn();
  const setPushToTalkEnabled = vi.fn();
  render(
    <DeviceControls
      micEnabled
      setMicEnabled={vi.fn()}
      camEnabled={false}
      setCamEnabled={vi.fn()}
      screenEnabled={false}
      setScreenEnabled={vi.fn()}
      mediaErrors={{}}
      mediaPending={{ mic: false, cam: false, screen: false }}
      clearMediaError={vi.fn()}
      audioInputs={[]}
      videoInputs={[]}
      audioOutputs={[]}
      audioInputId=""
      setAudioInputId={vi.fn()}
      videoInputId=""
      setVideoInputId={vi.fn()}
      audioOutputId=""
      setAudioOutputId={vi.fn()}
      outputSelectionSupported={false}
      devicesRefreshing={false}
      deviceInventoryError={null}
      refreshDevices={vi.fn().mockResolvedValue([])}
      pushToTalkEnabled={false}
      setPushToTalkEnabled={setPushToTalkEnabled}
      pushToTalkDown={false}
      pushToTalkBindingLabel="Space"
      stopPushToTalkTransmit={stopPushToTalkTransmit}
      closePushToTalkGate={closePushToTalkGate}
      isRebindingPushToTalkKey={false}
      setIsRebindingPushToTalkKey={vi.fn()}
      {...overrides}
    />,
  );
  return {
    closePushToTalkGate,
    stopPushToTalkTransmit,
    setPushToTalkEnabled,
  };
}

describe("DeviceControls", () => {
  it("closes the live microphone before enabling push-to-talk", async () => {
    const callbacks = renderControls();
    const button = screen.getByRole("button", { name: "Push-to-talk" });
    expect(button).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(button);

    expect(callbacks.closePushToTalkGate).toHaveBeenCalledOnce();
    expect(callbacks.stopPushToTalkTransmit).not.toHaveBeenCalled();
    expect(callbacks.setPushToTalkEnabled).toHaveBeenCalledWith(true);
    expect(
      callbacks.closePushToTalkGate.mock.invocationCallOrder[0],
    ).toBeLessThan(callbacks.setPushToTalkEnabled.mock.invocationCallOrder[0]!);
  });

  it("exposes the push-to-talk and rebinding toggle states", () => {
    renderControls({
      pushToTalkEnabled: true,
      isRebindingPushToTalkKey: true,
    });

    expect(screen.getByRole("button", { name: /PTT on/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Listening…" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
