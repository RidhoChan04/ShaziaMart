type AudioCtor = typeof AudioContext;

let shared: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (shared) return shared;
  const w = globalThis as unknown as {
    AudioContext?: AudioCtor;
    webkitAudioContext?: AudioCtor;
  };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  shared = new Ctor();
  return shared;
}

const TONES = {
  ok: { hz: 880, seconds: 0.08 },
  error: { hz: 220, seconds: 0.25 },
} as const;

/** Bunyi pendek untuk umpan balik scan. Tidak pernah melempar. */
export function beep(kind: "ok" | "error"): void {
  try {
    const ctx = getContext();
    if (!ctx) return;
    if (ctx.state === "suspended")
      Promise.resolve(ctx.resume()).catch(() => {});
    const { hz, seconds } = TONES[kind];
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = hz;
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + seconds);
  } catch {
    // Audio tidak boleh mengganggu alur kasir.
  }
}

export function __resetBeepForTests(): void {
  shared = null;
}
