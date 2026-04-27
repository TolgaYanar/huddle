"use client";

/**
 * Tiny Web Audio synth for Cup Spider sound stingers. We deliberately avoid
 * importing audio files — every sound here is generated from oscillators
 * and noise, so there's no asset pipeline, no loading delay, and no licensing
 * baggage. The trade-off is that the textures are simple ("game console"
 * style); that fits the arcade vibe of this game.
 *
 * Browsers gate AudioContext creation behind a user gesture. We lazily build
 * the context on the first call after the user interacts with the panel.
 */

type SoundKind =
  | "cupTap"
  | "cupFlip"
  | "spider"
  | "hurt"
  | "shielded"
  | "draw"
  | "good"
  | "bad"
  | "skip"
  | "eliminate"
  | "victory"
  | "lock";

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let muted = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx && ctx.state !== "closed") return ctx;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.55;
    masterGain.connect(ctx.destination);
    return ctx;
  } catch {
    return null;
  }
}

function ensureRunning() {
  const c = getCtx();
  if (!c) return null;
  if (c.state === "suspended") {
    c.resume().catch(() => undefined);
  }
  return c;
}

export function setSoundMuted(value: boolean) {
  muted = value;
  if (!masterGain) return;
  masterGain.gain.value = value ? 0 : 0.55;
}

export function isSoundMuted() {
  return muted;
}

function tone(freq: number, durationMs: number, opts?: {
  type?: OscillatorType;
  attack?: number;
  release?: number;
  gain?: number;
  detune?: number;
  sweepTo?: number;
}) {
  const c = ensureRunning();
  if (!c || !masterGain || muted) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts?.type ?? "sine";
  osc.frequency.value = freq;
  if (opts?.detune) osc.detune.value = opts.detune;
  const now = c.currentTime;
  const attack = opts?.attack ?? 0.005;
  const release = opts?.release ?? 0.07;
  const peak = opts?.gain ?? 0.18;
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(peak, now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000 + release);
  if (opts?.sweepTo !== undefined) {
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(40, opts.sweepTo),
      now + durationMs / 1000,
    );
  }
  osc.connect(g);
  g.connect(masterGain);
  osc.start(now);
  osc.stop(now + durationMs / 1000 + release + 0.05);
}

function noiseBurst(durationMs: number, opts?: { gain?: number; filterFreq?: number }) {
  const c = ensureRunning();
  if (!c || !masterGain || muted) return;
  const sampleRate = c.sampleRate;
  const length = Math.max(1, Math.floor((durationMs / 1000) * sampleRate));
  const buffer = c.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * 0.6;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = opts?.filterFreq ?? 1800;
  filter.Q.value = 0.7;
  const g = c.createGain();
  const now = c.currentTime;
  const peak = opts?.gain ?? 0.25;
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(peak, now + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
  src.connect(filter);
  filter.connect(g);
  g.connect(masterGain);
  src.start(now);
  src.stop(now + durationMs / 1000 + 0.05);
}

export function playSound(kind: SoundKind) {
  if (muted) return;
  switch (kind) {
    case "cupTap":
      tone(620, 60, { type: "triangle", gain: 0.12 });
      return;
    case "cupFlip":
      tone(380, 90, { type: "sine", gain: 0.18, sweepTo: 240 });
      tone(720, 50, { type: "triangle", gain: 0.08 });
      return;
    case "spider": {
      noiseBurst(160, { gain: 0.18, filterFreq: 2400 });
      tone(220, 110, { type: "sawtooth", gain: 0.12, sweepTo: 110 });
      return;
    }
    case "hurt": {
      noiseBurst(220, { gain: 0.32, filterFreq: 900 });
      tone(140, 220, { type: "square", gain: 0.16, sweepTo: 70 });
      setTimeout(() => tone(110, 180, { type: "sawtooth", gain: 0.12, sweepTo: 60 }), 90);
      return;
    }
    case "shielded": {
      tone(880, 80, { type: "sine", gain: 0.18 });
      setTimeout(() => tone(1320, 120, { type: "triangle", gain: 0.14 }), 70);
      return;
    }
    case "draw": {
      tone(520, 80, { type: "triangle", gain: 0.12 });
      setTimeout(() => tone(780, 90, { type: "sine", gain: 0.14 }), 70);
      return;
    }
    case "good": {
      tone(660, 110, { type: "triangle", gain: 0.16 });
      setTimeout(() => tone(880, 130, { type: "triangle", gain: 0.16 }), 90);
      setTimeout(() => tone(1320, 180, { type: "sine", gain: 0.16 }), 200);
      return;
    }
    case "bad": {
      tone(180, 200, { type: "sawtooth", gain: 0.18, sweepTo: 90 });
      setTimeout(() => tone(120, 220, { type: "square", gain: 0.16, sweepTo: 60 }), 100);
      return;
    }
    case "skip": {
      tone(440, 100, { type: "sine", gain: 0.12, sweepTo: 220 });
      return;
    }
    case "eliminate": {
      tone(220, 360, { type: "sawtooth", gain: 0.2, sweepTo: 60 });
      noiseBurst(380, { gain: 0.18, filterFreq: 600 });
      return;
    }
    case "victory": {
      tone(523, 140, { type: "triangle", gain: 0.18 }); // C5
      setTimeout(() => tone(659, 140, { type: "triangle", gain: 0.18 }), 130); // E5
      setTimeout(() => tone(784, 140, { type: "triangle", gain: 0.18 }), 260); // G5
      setTimeout(() => tone(1046, 320, { type: "triangle", gain: 0.2 }), 390); // C6
      return;
    }
    case "lock": {
      tone(540, 80, { type: "triangle", gain: 0.16 });
      setTimeout(() => tone(720, 110, { type: "sine", gain: 0.16 }), 70);
      return;
    }
  }
}
