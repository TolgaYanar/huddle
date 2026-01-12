"use client";

import { useEffect } from "react";

export function SilentAudio() {
  useEffect(() => {
    let ctx: AudioContext | null = null;
    let osc: OscillatorNode | null = null;
    let gain: GainNode | null = null;
    let resumeTimer: number | null = null;

    const keepAlive = () => {
      if (!ctx || ctx.state === "closed") {
        // Recreate if the context was closed by the browser while hidden.
        ctx = null;
        osc = null;
        gain = null;
        startAudio();
        return;
      }

      if (ctx.state === "suspended") {
        ctx.resume().catch((err) => {
          console.error("Audio resume failed", err);
        });
      }
    };

    const startAudio = () => {
      if (ctx) return;

      try {
        const win = window as Window & {
          webkitAudioContext?: typeof AudioContext;
        };

        const CtxClass =
          (typeof AudioContext !== "undefined" ? AudioContext : undefined) ||
          win.webkitAudioContext;
        if (!CtxClass) return;

        ctx = new CtxClass();
        osc = ctx.createOscillator();
        gain = ctx.createGain();

        // Connect
        osc.connect(gain);
        gain.connect(ctx.destination);

        // Brown Noise frequency (low rumble)
        osc.frequency.value = 50;

        // VOLUME: 0.001 (Audible to computer, silent to human)
        gain.gain.value = 0.001;

        osc.start();
        console.log(
          "🔊 Audio Context Started (Background Throttling Disabled)"
        );

        // If the browser suspends/ends the oscillator, try to rebuild.
        osc.onended = () => {
          ctx = null;
          osc = null;
          gain = null;
          keepAlive();
        };

        document.addEventListener("visibilitychange", keepAlive);
        window.addEventListener("pageshow", keepAlive);
        window.addEventListener("focus", keepAlive);

        resumeTimer = window.setInterval(keepAlive, 5000);
      } catch (e) {
        console.error("Audio unlock failed", e);
      }
    };

    const unlock = () => {
      startAudio();
      if (ctx && ctx.state === "suspended") ctx.resume();
      // We don't remove listeners immediately in case the first click fails
    };

    window.addEventListener("click", unlock);
    window.addEventListener("touchstart", unlock);
    window.addEventListener("keydown", unlock);

    return () => {
      window.removeEventListener("click", unlock);
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("keydown", unlock);
      document.removeEventListener("visibilitychange", keepAlive);
      window.removeEventListener("pageshow", keepAlive);
      window.removeEventListener("focus", keepAlive);
      if (resumeTimer) window.clearInterval(resumeTimer);
      if (osc) osc.stop();
      if (ctx) ctx.close();
    };
  }, []);

  return null;
}
