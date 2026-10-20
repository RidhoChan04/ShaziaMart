import { afterEach, expect, test, vi } from "vitest";
import { __resetBeepForTests, beep } from "./beep";

afterEach(() => {
  vi.unstubAllGlobals();
  __resetBeepForTests();
});

test("beep tidak melempar tanpa AudioContext", () => {
  expect(() => beep("ok")).not.toThrow();
});

function stubAudio() {
  const osc = {
    type: "",
    frequency: { value: 0 },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
  const gain = {
    gain: {
      value: 0,
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
  };
  const ctx = {
    currentTime: 1,
    destination: {},
    state: "running",
    resume: vi.fn(),
    createOscillator: vi.fn(() => osc),
    createGain: vi.fn(() => gain),
  };
  const Ctor = vi.fn();
  class FakeAudioContext {
    constructor() {
      Ctor();
      Object.assign(this, ctx);
    }
  }
  vi.stubGlobal("AudioContext", FakeAudioContext);
  return { osc, ctx, Ctor };
}

test("beep ok: 880 Hz selama 80 ms, konteks dipakai ulang", () => {
  const { osc, Ctor } = stubAudio();
  beep("ok");
  beep("error");
  expect(Ctor).toHaveBeenCalledTimes(1);
  expect(osc.frequency.value).toBe(220);
  expect(osc.stop).toHaveBeenLastCalledWith(1.25);
});

test("beep ok memakai 880 Hz dan 80 ms", () => {
  const { osc } = stubAudio();
  beep("ok");
  expect(osc.frequency.value).toBe(880);
  expect(osc.stop).toHaveBeenCalledWith(1.08);
});

test("beep tidak melempar bila WebAudio rusak", () => {
  vi.stubGlobal("AudioContext", () => {
    throw new Error("boom");
  });
  expect(() => beep("error")).not.toThrow();
});
