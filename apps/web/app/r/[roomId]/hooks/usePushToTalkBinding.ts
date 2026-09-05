import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";

export type PushToTalkBinding =
  | {
      type: "keyboard";
      code: string;
      ctrl: boolean;
      alt: boolean;
      shift: boolean;
      meta: boolean;
    }
  | {
      type: "mouse";
      button: number;
      ctrl: boolean;
      alt: boolean;
      shift: boolean;
      meta: boolean;
    };

export const DEFAULT_PUSH_TO_TALK_BINDING: PushToTalkBinding = {
  type: "keyboard",
  code: "Space",
  ctrl: false,
  alt: false,
  shift: false,
  meta: false,
};

const isInteractiveTarget = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = (el.tagName || "").toLowerCase();
  if (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    tag === "button" ||
    tag === "a" ||
    tag === "summary"
  )
    return true;
  if (
    el.closest?.(
      'input, textarea, select, button, a, summary, [role="button"], [role="switch"], [role="menuitem"]',
    )
  )
    return true;
  if (el.isContentEditable) return true;
  return false;
};

const formatKeyCode = (code: string) => {
  if (!code) return "(unset)";
  if (code === "Space") return "Space";
  if (code.startsWith("Key") && code.length === 4) return code.slice(3);
  if (code.startsWith("Digit") && code.length === 6) return code.slice(5);
  return code;
};

export const formatPushToTalkBinding = (binding: PushToTalkBinding) => {
  const mods = [
    binding.ctrl ? "Ctrl" : null,
    binding.alt ? "Alt" : null,
    binding.shift ? "Shift" : null,
    binding.meta ? "Meta" : null,
  ].filter(Boolean);

  if (binding.type === "keyboard") {
    return [...mods, formatKeyCode(binding.code)].join("+");
  }

  const mouseLabel =
    binding.button === 0
      ? "Mouse Left"
      : binding.button === 1
        ? "Mouse Middle"
        : binding.button === 2
          ? "Mouse Right"
          : `Mouse Button ${binding.button}`;

  return [...mods, mouseLabel].join("+");
};

export function usePushToTalkBinding(params: {
  isClient: boolean;
  enabled: boolean;
  micEnabled: boolean;
  downRef?: MutableRefObject<boolean>;
  onTransmitChange?: (isDown: boolean) => void;
}) {
  const { isClient, enabled, micEnabled, onTransmitChange } = params;

  const [binding, setBinding] = useState<PushToTalkBinding>(
    DEFAULT_PUSH_TO_TALK_BINDING,
  );
  const bindingLabel = useMemo(
    () => formatPushToTalkBinding(binding),
    [binding],
  );

  const [isRebinding, setIsRebinding] = useState(false);

  const [isDown, setIsDown] = useState(false);
  const internalDownRef = useRef(false);
  const isDownRef = params.downRef ?? internalDownRef;

  const setTransmitDown = useCallback(
    (next: boolean) => {
      isDownRef.current = next;
      setIsDown(next);
      onTransmitChange?.(next);
    },
    [isDownRef, onTransmitChange],
  );

  const stopTransmit = useCallback(() => {
    setTransmitDown(false);
  }, [setTransmitDown]);

  useEffect(() => {
    if (!micEnabled) stopTransmit();
  }, [micEnabled, stopTransmit]);

  // Load/save binding.
  useEffect(() => {
    if (!isClient) return;
    try {
      const saved = window.localStorage.getItem("huddle.pushToTalkBinding");
      if (saved) {
        const parsed = JSON.parse(saved) as PushToTalkBinding;
        if (parsed && (parsed.type === "keyboard" || parsed.type === "mouse")) {
          setBinding(parsed);
          return;
        }
      }

      // Migration: old single keyCode.
      const old = window.localStorage.getItem("huddle.pushToTalkKeyCode");
      if (old) {
        setBinding({
          type: "keyboard",
          code: old,
          ctrl: false,
          alt: false,
          shift: false,
          meta: false,
        });
      }
    } catch {
      // ignore
    }
  }, [isClient]);

  useEffect(() => {
    if (!isClient) return;
    try {
      window.localStorage.setItem(
        "huddle.pushToTalkBinding",
        JSON.stringify(binding),
      );
    } catch {
      // ignore
    }
  }, [isClient, binding]);

  // Rebinding flow: captures next key or mouse button.
  useEffect(() => {
    if (!isClient) return;
    if (!isRebinding) return;

    stopTransmit();

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.code === "Escape") {
        setIsRebinding(false);
        return;
      }

      setBinding({
        type: "keyboard",
        code: e.code,
        ctrl: e.ctrlKey,
        alt: e.altKey,
        shift: e.shiftKey,
        meta: e.metaKey,
      });
      setIsRebinding(false);
    };

    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      setBinding({
        type: "mouse",
        button: e.button,
        ctrl: e.ctrlKey,
        alt: e.altKey,
        shift: e.shiftKey,
        meta: e.metaKey,
      });
      setIsRebinding(false);
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("mousedown", onMouseDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("mousedown", onMouseDown, true);
    };
  }, [isClient, isRebinding, stopTransmit]);

  // Push-to-talk hold listeners.
  useEffect(() => {
    if (!isClient) return;
    if (!enabled) {
      stopTransmit();
      return;
    }
    if (isRebinding) {
      stopTransmit();
      return;
    }

    const matchesKeyboardDown = (e: KeyboardEvent) => {
      if (binding.type !== "keyboard") return false;
      if (e.code !== binding.code) return false;
      if (binding.ctrl !== e.ctrlKey) return false;
      if (binding.alt !== e.altKey) return false;
      if (binding.shift !== e.shiftKey) return false;
      if (binding.meta !== e.metaKey) return false;
      return true;
    };

    const matchesKeyboardUp = (e: KeyboardEvent) => {
      if (binding.type !== "keyboard") return false;
      return e.code === binding.code;
    };

    const matchesMouseDown = (e: MouseEvent) => {
      if (binding.type !== "mouse") return false;
      if (e.button !== binding.button) return false;
      if (binding.ctrl !== e.ctrlKey) return false;
      if (binding.alt !== e.altKey) return false;
      if (binding.shift !== e.shiftKey) return false;
      if (binding.meta !== e.metaKey) return false;
      return true;
    };

    const matchesMouseUp = (e: MouseEvent) => {
      if (binding.type !== "mouse") return false;
      return e.button === binding.button;
    };

    const keyDown = (e: KeyboardEvent) => {
      if (!micEnabled) return;
      if (isInteractiveTarget(e.target)) return;
      if (!matchesKeyboardDown(e)) return;
      if (e.repeat) return;
      setTransmitDown(true);
      e.preventDefault();
    };

    const keyUp = (e: KeyboardEvent) => {
      if (!matchesKeyboardUp(e)) return;
      // A keydown on a focused button/input is deliberately ignored. Do not
      // consume its matching keyup either: native Space activation happens on
      // keyup in several browsers.
      if (!isDownRef.current) return;
      setTransmitDown(false);
      e.preventDefault();
    };

    const mouseDown = (e: MouseEvent) => {
      if (!micEnabled) return;
      if (isInteractiveTarget(e.target)) return;
      if (!matchesMouseDown(e)) return;
      setTransmitDown(true);
      e.preventDefault();
    };

    const mouseUp = (e: MouseEvent) => {
      if (!matchesMouseUp(e)) return;
      if (!isDownRef.current) return;
      setTransmitDown(false);
      e.preventDefault();
    };

    const blur = () => {
      stopTransmit();
    };
    const visibilityChange = () => {
      if (document.visibilityState !== "visible") stopTransmit();
    };

    window.addEventListener("keydown", keyDown, true);
    window.addEventListener("keyup", keyUp, true);
    window.addEventListener("mousedown", mouseDown, true);
    window.addEventListener("mouseup", mouseUp, true);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibilityChange);
    return () => {
      window.removeEventListener("keydown", keyDown, true);
      window.removeEventListener("keyup", keyUp, true);
      window.removeEventListener("mousedown", mouseDown, true);
      window.removeEventListener("mouseup", mouseUp, true);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibilityChange);
    };
  }, [
    isClient,
    enabled,
    micEnabled,
    binding,
    isRebinding,
    isDownRef,
    stopTransmit,
    setTransmitDown,
  ]);

  return {
    binding,
    bindingLabel,
    isRebinding,
    setIsRebinding,
    isDown,
    isDownRef,
    stopTransmit,
    setBinding,
  };
}
