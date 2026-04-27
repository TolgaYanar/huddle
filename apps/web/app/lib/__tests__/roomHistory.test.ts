import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearRoomHistory,
  readRoomHistory,
  writeRoomHistory,
} from "../roomHistory";

const STORAGE_KEY = "huddle:roomHistory";

describe("roomHistory", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("readRoomHistory", () => {
    it("returns [] when storage is empty", () => {
      expect(readRoomHistory()).toEqual([]);
    });

    it("returns [] when storage is malformed JSON", () => {
      window.localStorage.setItem(STORAGE_KEY, "{not json");
      expect(readRoomHistory()).toEqual([]);
    });

    it("returns [] when stored value is not an array", () => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ a: 1 }));
      expect(readRoomHistory()).toEqual([]);
    });

    it("filters out entries missing required fields", () => {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          { roomId: "abc", name: "A", visitedAt: 1 },
          { roomId: "def", visitedAt: 2 },
          { name: "no-room" },
          null,
          "invalid",
          { roomId: 123, visitedAt: 3 },
        ]),
      );
      const out = readRoomHistory();
      expect(out).toHaveLength(2);
      expect(out[0]).toMatchObject({ roomId: "abc" });
      expect(out[1]).toMatchObject({ roomId: "def" });
    });
  });

  describe("writeRoomHistory", () => {
    it("prepends the entry and limits the list to 10", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 0, 1));

      for (let i = 0; i < 12; i++) {
        vi.advanceTimersByTime(1000);
        writeRoomHistory(`room-${i}`, null);
      }

      const out = readRoomHistory();
      expect(out).toHaveLength(10);
      expect(out[0]?.roomId).toBe("room-11");
      expect(out[9]?.roomId).toBe("room-2");
    });

    it("dedupes by roomId, moving the entry to the front", () => {
      writeRoomHistory("a", "Alpha");
      writeRoomHistory("b", "Beta");
      writeRoomHistory("a", "Alpha 2");

      const out = readRoomHistory();
      expect(out.map((e) => e.roomId)).toEqual(["a", "b"]);
      expect(out[0]?.name).toBe("Alpha 2");
    });

    it("keeps the legacy huddle:lastRoomId pointer in sync", () => {
      writeRoomHistory("xyz", null);
      expect(window.localStorage.getItem("huddle:lastRoomId")).toBe("xyz");
    });
  });

  describe("clearRoomHistory", () => {
    it("removes the storage entry", () => {
      writeRoomHistory("a", null);
      expect(readRoomHistory()).toHaveLength(1);

      clearRoomHistory();

      expect(readRoomHistory()).toHaveLength(0);
      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it("is a no-op when storage is already empty", () => {
      expect(() => clearRoomHistory()).not.toThrow();
      expect(readRoomHistory()).toEqual([]);
    });
  });
});
