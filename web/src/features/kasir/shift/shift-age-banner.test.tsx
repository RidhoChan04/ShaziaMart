import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ShiftAgeBanner } from "./shift-age-banner";

const HOUR = 3_600_000;
const OPENED = Date.UTC(2026, 10, 19, 0);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
});
afterEach(() => {
  vi.useRealTimers();
});

const at = (ms: number) => vi.setSystemTime(OPENED + ms);

test("13 jam > batas 12 → pita 'Shift sudah buka 13 jam — tutup shift saat gantian'", () => {
  at(13 * HOUR + 5 * 60_000);
  render(<ShiftAgeBanner openedAt={OPENED} maxHours={12} />);
  expect(
    screen.getByText("Shift sudah buka 13 jam — tutup shift saat gantian"),
  ).toBeInTheDocument();
});

test("tepat 12 jam → tidak tampil; lewat 1 ms → tampil '12 jam'", () => {
  at(12 * HOUR);
  render(<ShiftAgeBanner openedAt={OPENED} maxHours={12} />);
  expect(screen.queryByText(/Shift sudah buka/)).toBeNull();
  act(() => {
    at(12 * HOUR + 1);
    vi.advanceTimersByTime(60_000);
  });
  expect(
    screen.getByText("Shift sudah buka 12 jam — tutup shift saat gantian"),
  ).toBeInTheDocument();
});

test("batas dari Pengaturan: maxHours 8 → 9 jam tampil", () => {
  at(9 * HOUR);
  render(<ShiftAgeBanner openedAt={OPENED} maxHours={8} />);
  expect(screen.getByText(/Shift sudah buka 9 jam/)).toBeInTheDocument();
});
