import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useScrolledPast } from "./use-scrolled-past";

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;

class FakeIntersectionObserver {
  static last: FakeIntersectionObserver | null = null;
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();
  readonly callback: Callback;
  constructor(callback: Callback) {
    this.callback = callback;
    FakeIntersectionObserver.last = this;
  }
}

function entry(isIntersecting: boolean, top: number) {
  return {
    isIntersecting,
    boundingClientRect: { top, bottom: top + 40 } as DOMRectReadOnly,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeIntersectionObserver.last = null;
});

test("useScrolledPast: true saat elemen keluar viewport ke atas, false lagi saat kembali", () => {
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  const el = document.createElement("h1");
  const { result, unmount } = renderHook(() =>
    useScrolledPast({ current: el }),
  );
  const io = FakeIntersectionObserver.last;
  if (!io) throw new Error("IntersectionObserver tidak dibuat");
  expect(io.observe).toHaveBeenCalledWith(el);
  expect(result.current).toBe(false);

  act(() => io.callback([entry(false, -60)]));
  expect(result.current).toBe(true);

  act(() => io.callback([entry(true, 10)]));
  expect(result.current).toBe(false);

  unmount();
  expect(io.disconnect).toHaveBeenCalled();
});

test("useScrolledPast: elemen di bawah viewport belum dianggap tergulir lewat", () => {
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  const { result } = renderHook(() =>
    useScrolledPast({ current: document.createElement("h1") }),
  );
  act(() => FakeIntersectionObserver.last?.callback([entry(false, 900)]));
  expect(result.current).toBe(false);
});

test("useScrolledPast: false tanpa IntersectionObserver", () => {
  vi.stubGlobal("IntersectionObserver", undefined);
  const { result } = renderHook(() =>
    useScrolledPast({ current: document.createElement("h1") }),
  );
  expect(result.current).toBe(false);
});
