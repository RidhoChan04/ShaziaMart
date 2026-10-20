import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

/**
 * userEvent dengan jeda antar-tombol persis `gapMs` menurut `performance.now()`.
 * Hanya `performance` yang dipalsukan, jadi test tidak benar-benar menunggu; tiap
 * pengetik baru mulai setelah jeda 1 dtk agar tidak menyambung ketikan sebelumnya.
 */
export function typingAt(gapMs: number) {
  if (!vi.isFakeTimers()) vi.useFakeTimers({ toFake: ["performance"] });
  vi.advanceTimersByTime(1000);
  return userEvent.setup({
    delay: 0,
    advanceTimers: () => vi.advanceTimersByTime(gapMs),
  });
}

/** Kecepatan tangan manusia: 60 ms per tombol. */
export const humanTyping = () => typingAt(60);

/** Kecepatan pemindai keyboard-wedge: 5 ms per tombol. */
export const scannerTyping = () => typingAt(5);
