import { useEffect, useState } from "react";
import type { WheelStateData, WheelSpunData } from "shared-logic";

interface UseWheelPickerProps {
  roomId: string;
  onWheelState?: (
    callback: (data: WheelStateData) => void
  ) => (() => void) | undefined;
  onWheelSpun?: (
    callback: (data: WheelSpunData) => void
  ) => (() => void) | undefined;
  requestWheelState?: () => void;
  addWheelEntry?: (text: string) => void;
  removeWheelEntry?: (idx: number) => void;
  clearWheelEntries?: () => void;
  spinWheel?: () => void;
}

export function useWheelPicker({
  roomId,
  onWheelState,
  onWheelSpun,
  requestWheelState,
  addWheelEntry,
  removeWheelEntry,
  clearWheelEntries,
  spinWheel,
}: UseWheelPickerProps) {
  const [wheelEntries, setWheelEntries] = useState<string[]>([]);
  const [wheelLastSpin, setWheelLastSpin] = useState<WheelSpunData | null>(
    null
  );
  const [isWheelOpen, setIsWheelOpen] = useState(false);

  useEffect(() => {
    const cleanups: Array<() => void> = [];

    if (onWheelState) {
      const off = onWheelState((data) => {
        if (!data || data.roomId !== roomId) return;
        setWheelEntries(Array.isArray(data.entries) ? data.entries : []);

        const last = data.lastSpin;
        if (last && typeof last === "object") {
          setWheelLastSpin({ ...last, roomId });
        }
      });
      if (typeof off === "function") cleanups.push(off);
    }

    if (onWheelSpun) {
      const off = onWheelSpun((data) => {
        if (!data || data.roomId !== roomId) return;
        setWheelLastSpin(data);
      });
      if (typeof off === "function") cleanups.push(off);
    }

    requestWheelState?.();

    return () => {
      cleanups.forEach((fn) => {
        try {
          fn();
        } catch {
          // ignore
        }
      });
    };
  }, [onWheelState, onWheelSpun, requestWheelState, roomId]);

  return {
    wheelEntries,
    wheelLastSpin,
    isWheelOpen,
    setIsWheelOpen,
    addWheelEntry,
    removeWheelEntry,
    clearWheelEntries,
    spinWheel,
  };
}
