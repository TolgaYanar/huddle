import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useStableCallback } from "../useStableCallback";

describe("useStableCallback", () => {
  it("keeps its identity across renders and calls the latest function", () => {
    const first = vi.fn<(arg: string) => number>(() => 1);
    const second = vi.fn<(arg: string) => number>(() => 2);
    const { result, rerender } = renderHook(({ fn }) => useStableCallback(fn), {
      initialProps: { fn: first },
    });
    const stable = result.current;

    rerender({ fn: second });

    expect(result.current).toBe(stable);
    expect(result.current("x")).toBe(2);
    expect(second).toHaveBeenCalledWith("x");
    expect(first).not.toHaveBeenCalled();
  });
});
