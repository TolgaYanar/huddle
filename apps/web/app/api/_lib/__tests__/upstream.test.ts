import { describe, expect, it } from "vitest";

import { clampIntParam, readBytesWithLimit, upstreamSignal } from "../upstream";

describe("clampIntParam", () => {
  it("uses the fallback when the parameter is absent or not a number", () => {
    expect(clampIntParam(null, 12, 1, 25)).toBe(12);
    expect(clampIntParam("abc", 12, 1, 25)).toBe(12);
    expect(clampIntParam("", 12, 1, 25)).toBe(12);
  });

  it("clamps to the range and drops fractions", () => {
    expect(clampIntParam("0", 12, 1, 25)).toBe(1);
    expect(clampIntParam("-4", 12, 1, 25)).toBe(1);
    expect(clampIntParam("999", 12, 1, 25)).toBe(25);
    expect(clampIntParam("2.5", 12, 1, 25)).toBe(2);
    expect(clampIntParam("7", 12, 1, 25)).toBe(7);
  });
});

describe("upstreamSignal", () => {
  it("returns a fresh, not-yet-aborted signal each call", () => {
    const a = upstreamSignal();
    const b = upstreamSignal();
    expect(a).not.toBe(b);
    expect(a.aborted).toBe(false);
  });
});

function streamOf(chunks: number[], onCancel?: () => void) {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(new Uint8Array(chunks[i++]!));
      else controller.close();
    },
    cancel() {
      onCancel?.();
    },
  });
}

describe("readBytesWithLimit", () => {
  it("returns the whole body when it fits", async () => {
    const res = new Response(streamOf([3, 4]));
    const bytes = await readBytesWithLimit(res, 10);
    expect(bytes?.byteLength).toBe(7);
  });

  it("stops and cancels the stream once the limit is passed", async () => {
    let cancelled = false;
    const res = new Response(
      streamOf([6, 6, 6, 6], () => {
        cancelled = true;
      }),
    );
    expect(await readBytesWithLimit(res, 10)).toBeNull();
    expect(cancelled).toBe(true);
  });

  it("rejects a declared content-length over the limit without reading", async () => {
    const res = new Response("x".repeat(20), {
      headers: { "content-length": "20" },
    });
    expect(await readBytesWithLimit(res, 10)).toBeNull();
  });
});
