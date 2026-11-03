import { vi } from "vitest";

export type FakeTrack = {
  stop: ReturnType<typeof vi.fn>;
  applyConstraints: ReturnType<typeof vi.fn>;
  getCapabilities: () => { torch?: boolean };
  onended: (() => void) | null;
};

/**
 * BarcodeDetector + kamera palsu; `detections` diisi tes, dibaca detector pada tiap detect().
 * `supported` = hasil getSupportedFormats(); `formats` mencatat format yang diminta detector.
 */
export function installCamera(
  options: { torch?: boolean; supported?: string[] } = {},
) {
  const state = {
    detections: [] as string[],
    detectCalls: 0,
    formats: undefined as readonly string[] | undefined,
  };
  const track: FakeTrack = {
    stop: vi.fn(),
    applyConstraints: vi.fn().mockResolvedValue(undefined),
    getCapabilities: () => (options.torch ? { torch: true } : {}),
    onended: null,
  };
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  };
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  const vibrate = vi.fn();
  const supported = options.supported ?? ["ean_13", "ean_8", "upc_a", "itf"];
  class FakeDetector {
    static getSupportedFormats() {
      return Promise.resolve(supported);
    }
    constructor(init?: { formats?: readonly string[] }) {
      state.formats = init?.formats;
    }
    detect() {
      state.detectCalls += 1;
      return Promise.resolve(
        state.detections.map((rawValue) => ({ rawValue })),
      );
    }
  }
  vi.stubGlobal("BarcodeDetector", FakeDetector);
  vi.stubGlobal("navigator", {
    ...navigator,
    mediaDevices: { getUserMedia },
    vibrate,
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  return { state, track, stream, getUserMedia, vibrate };
}
