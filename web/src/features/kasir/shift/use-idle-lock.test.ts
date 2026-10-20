import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useIdleLock } from "./use-idle-lock";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test("tanpa aktivitas 5 menit → onLock sekali", () => {
  const onLock = vi.fn();
  renderHook(() => useIdleLock(onLock));
  vi.advanceTimersByTime(299_999);
  expect(onLock).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(onLock).toHaveBeenCalledOnce();
});

test.each(["pointerdown", "keydown"])("%s mereset hitungan", (type) => {
  const onLock = vi.fn();
  renderHook(() => useIdleLock(onLock));
  vi.advanceTimersByTime(200_000);
  window.dispatchEvent(new Event(type));
  vi.advanceTimersByTime(200_000);
  expect(onLock).not.toHaveBeenCalled();
  vi.advanceTimersByTime(100_000);
  expect(onLock).toHaveBeenCalledOnce();
});

test("callback terbaru yang dipanggil; unmount membatalkan", () => {
  const first = vi.fn();
  const second = vi.fn();
  const { rerender, unmount } = renderHook(({ cb }) => useIdleLock(cb, 1000), {
    initialProps: { cb: first },
  });
  rerender({ cb: second });
  vi.advanceTimersByTime(1000);
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledOnce();

  const third = vi.fn();
  const other = renderHook(() => useIdleLock(third, 1000));
  other.unmount();
  unmount();
  vi.advanceTimersByTime(5000);
  expect(third).not.toHaveBeenCalled();
});
