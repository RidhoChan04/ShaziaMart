import { vi } from "vitest";

/** ResizeObserver palsu yang langsung melaporkan lebar tertentu saat observe(); lepas lewat `vi.unstubAllGlobals()`. */
export function stubWidth(width: number) {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) {
        this.cb = cb;
      }
      observe() {
        this.cb(
          [{ contentRect: { width } } as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        );
      }
      disconnect() {}
      unobserve() {}
    },
  );
}
