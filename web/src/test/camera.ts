import { vi } from "vitest";

export type FakeTrack = {
  stop: ReturnType<typeof vi.fn>;
  applyConstraints: ReturnType<typeof vi.fn>;
  getCapabilities: () => { torch?: boolean };
};

/** BarcodeDetector + kamera palsu; `detections` diisi tes, dibaca detector pada tiap detect(). */
export function installCamera(options: { torch?: boolean } = {}) {
  const state = { detections: [] as string[], detectCalls: 0 };
  const track: FakeTrack = {
    stop: vi.fn(),
    applyConstraints: vi.fn().mockResolvedValue(undefined),
    getCapabilities: () => (options.torch ? { torch: true } : {}),
  };
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  };
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  const vibrate = vi.fn();
  class FakeDetector {
    static getSupportedFormats() {
      return Promise.resolve(["ean_13", "ean_8", "upc_a", "itf"]);
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
