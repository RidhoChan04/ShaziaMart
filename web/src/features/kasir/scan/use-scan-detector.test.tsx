import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useScanDetector } from "./use-scan-detector";

function Probe({ onScan }: { onScan: (code: string) => void }) {
  useScanDetector(onScan);
  return null;
}

function press(key: string, init: KeyboardEventInit = {}) {
  const ev = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  act(() => {
    window.dispatchEvent(ev);
  });
  return ev;
}

function type(text: string, gapMs: number) {
  for (const ch of text) {
    press(ch);
    act(() => {
      vi.advanceTimersByTime(gapMs);
    });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

test("ketikan cepat + Enter → onScan dengan kode", () => {
  const onScan = vi.fn();
  render(<Probe onScan={onScan} />);
  type("089686010947", 5);
  const enter = press("Enter");
  expect(onScan).toHaveBeenCalledExactlyOnceWith("089686010947");
  expect(enter.defaultPrevented).toBe(true);
});

test("ketikan lambat (jeda 60 ms) tidak dianggap scan", () => {
  const onScan = vi.fn();
  render(<Probe onScan={onScan} />);
  type("089686010947", 60);
  press("Enter");
  expect(onScan).not.toHaveBeenCalled();
});

test("kurang dari 4 karakter tidak dianggap scan", () => {
  const onScan = vi.fn();
  render(<Probe onScan={onScan} />);
  type("123", 5);
  press("Enter");
  expect(onScan).not.toHaveBeenCalled();
});

test("jeda panjang di tengah mengulang buffer", () => {
  const onScan = vi.fn();
  render(<Probe onScan={onScan} />);
  type("99", 5);
  act(() => {
    vi.advanceTimersByTime(100);
  });
  type("12345", 5);
  press("Enter");
  expect(onScan).toHaveBeenCalledExactlyOnceWith("12345");
});

test("kombinasi ctrl/alt/meta diabaikan", () => {
  const onScan = vi.fn();
  render(<Probe onScan={onScan} />);
  type("1234", 5);
  press("5", { ctrlKey: true });
  press("Enter");
  expect(onScan).toHaveBeenCalledExactlyOnceWith("1234");
});

test("diabaikan saat fokus di input", () => {
  const onScan = vi.fn();
  render(
    <>
      <input aria-label="x" />
      <Probe onScan={onScan} />
    </>,
  );
  document.querySelector("input")?.focus();
  type("089686010947", 5);
  press("Enter");
  expect(onScan).not.toHaveBeenCalled();
});

test("scan diabaikan saat dialog terbuka", () => {
  const onScan = vi.fn();
  render(
    <>
      <div role="dialog" aria-label="Dialog" />
      <Probe onScan={onScan} />
    </>,
  );
  type("089686010947", 5);
  press("Enter");
  expect(onScan).not.toHaveBeenCalled();
});

test("listener dilepas saat unmount", () => {
  const onScan = vi.fn();
  const { unmount } = render(<Probe onScan={onScan} />);
  unmount();
  type("089686010947", 5);
  press("Enter");
  expect(onScan).not.toHaveBeenCalled();
});
