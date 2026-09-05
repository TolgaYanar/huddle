import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConnectionStatusNotice } from "../ConnectionStatusNotice";

describe("ConnectionStatusNotice", () => {
  it("shows automatic recovery without asking the user to intervene", () => {
    render(
      <ConnectionStatusNotice
        userId="self"
        participants={["self", "peer"]}
        peerConnectionStates={{ peer: "recovering" }}
        localMediaExpected
        remoteMedia={{}}
        getDisplayName={() => "Ada"}
        retryFailedPeers={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Restoring call media with Ada",
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("exposes a retry after bounded recovery is exhausted", async () => {
    const retryFailedPeers = vi.fn().mockResolvedValue(undefined);
    render(
      <ConnectionStatusNotice
        userId="self"
        participants={["self", "peer"]}
        peerConnectionStates={{ peer: "failed" }}
        localMediaExpected
        remoteMedia={{}}
        getDisplayName={() => "Ada"}
        retryFailedPeers={retryFailedPeers}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "You and Ada may not be able to hear or see each other",
    );
    await userEvent.click(screen.getByRole("button", { name: "Retry call" }));
    expect(retryFailedPeers).toHaveBeenCalledOnce();
  });

  it("stays quiet while everyone has media off", () => {
    render(
      <ConnectionStatusNotice
        userId="self"
        participants={["self", "peer"]}
        peerConnectionStates={{ peer: "connecting" }}
        localMediaExpected={false}
        remoteMedia={{}}
        getDisplayName={() => "Ada"}
        retryFailedPeers={vi.fn()}
      />,
    );

    expect(screen.queryByRole("status")).toBeNull();
  });
});
