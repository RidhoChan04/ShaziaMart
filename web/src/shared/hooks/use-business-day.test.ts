import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useBusinessDay } from "./use-business-day";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  // Jumat 23 Okt 2026, 23.59.59 WIB
  vi.setSystemTime(Date.UTC(2026, 9, 23, 16, 59, 59));
});

afterEach(() => {
  vi.useRealTimers();
});

test("useBusinessDay berganti tepat setelah 00.00 WIB (fake timers)", () => {
  const { result } = renderHook(() => useBusinessDay());
  expect(result.current).toEqual({
    date: "2026-10-23",
    label: "Jumat, 23 Okt",
  });

  act(() => vi.advanceTimersByTime(999));
  expect(result.current.date).toBe("2026-10-23");

  act(() => vi.advanceTimersByTime(1));
  expect(result.current).toEqual({
    date: "2026-10-24",
    label: "Sabtu, 24 Okt",
  });

  // tengah malam berikutnya juga terjadwal
  act(() => vi.advanceTimersByTime(86_400_000));
  expect(result.current).toEqual({
    date: "2026-10-25",
    label: "Minggu, 25 Okt",
  });
});

test("timer tengah malam dibersihkan saat unmount", () => {
  const { unmount } = renderHook(() => useBusinessDay());
  expect(vi.getTimerCount()).toBe(1);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
