import { act, fireEvent, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { usePullToRefresh } from "./use-pull-to-refresh";

afterEach(() => {
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
});

const touch = (...ys: number[]) => ({
  touches: ys.map((clientY) => ({ clientY })),
});

function pull(from: number, to: number) {
  fireEvent.touchStart(document, touch(from));
  fireEvent.touchMove(document, touch(to));
  fireEvent.touchEnd(document);
}

test("tarik lebih dari 64px dari paling atas → refresh dan penanda memuat sampai selesai", async () => {
  let finish = () => {};
  const onRefresh = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const { result } = renderHook(() => usePullToRefresh(onRefresh));
  expect(result.current).toBe(false);

  act(() => pull(100, 165));
  expect(onRefresh).toHaveBeenCalledTimes(1);
  expect(result.current).toBe(true);

  await act(async () => finish());
  await waitFor(() => expect(result.current).toBe(false));
});

test("tarikan sependek atau tepat 64px, atau ke atas, tidak me-refresh", () => {
  const onRefresh = vi.fn();
  renderHook(() => usePullToRefresh(onRefresh));
  act(() => pull(100, 164));
  act(() => pull(100, 40));
  expect(onRefresh).not.toHaveBeenCalled();
});

test("tidak aktif bila halaman tidak berada di paling atas", () => {
  Object.defineProperty(window, "scrollY", { value: 120, configurable: true });
  const onRefresh = vi.fn();
  renderHook(() => usePullToRefresh(onRefresh));
  act(() => pull(100, 300));
  expect(onRefresh).not.toHaveBeenCalled();
});

test("mouse tidak memicu refresh", () => {
  const onRefresh = vi.fn();
  renderHook(() => usePullToRefresh(onRefresh));
  act(() => {
    fireEvent.mouseDown(document, { clientY: 100 });
    fireEvent.mouseMove(document, { clientY: 300 });
    fireEvent.mouseUp(document);
    fireEvent.pointerDown(document, { pointerType: "mouse", clientY: 100 });
    fireEvent.pointerMove(document, { pointerType: "mouse", clientY: 300 });
    fireEvent.pointerUp(document, { pointerType: "mouse" });
  });
  expect(onRefresh).not.toHaveBeenCalled();
});

test("sentuhan dibatalkan tidak me-refresh; listener dilepas saat unmount", () => {
  const onRefresh = vi.fn();
  const { unmount } = renderHook(() => usePullToRefresh(onRefresh));
  act(() => {
    fireEvent.touchStart(document, touch(100));
    fireEvent.touchMove(document, touch(300));
    fireEvent.touchCancel(document);
    fireEvent.touchEnd(document);
  });
  expect(onRefresh).not.toHaveBeenCalled();

  unmount();
  act(() => pull(100, 300));
  expect(onRefresh).not.toHaveBeenCalled();
});

test("gestur dua jari diabaikan", () => {
  const onRefresh = vi.fn();
  renderHook(() => usePullToRefresh(onRefresh));
  act(() => {
    fireEvent.touchStart(document, touch(100, 100));
    fireEvent.touchMove(document, touch(300, 300));
    fireEvent.touchEnd(document);
  });
  expect(onRefresh).not.toHaveBeenCalled();
});

test("halaman bergulir di tengah gestur → gestur dibatalkan", () => {
  const onRefresh = vi.fn();
  renderHook(() => usePullToRefresh(onRefresh));
  act(() => {
    fireEvent.touchStart(document, touch(100));
    Object.defineProperty(window, "scrollY", { value: 30, configurable: true });
    fireEvent.touchMove(document, touch(300));
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
    fireEvent.touchEnd(document);
  });
  expect(onRefresh).not.toHaveBeenCalled();
});

test("callback baru di tengah gestur tetap menyelesaikan gestur dan dipanggil", () => {
  const first = vi.fn(() => Promise.resolve());
  const second = vi.fn(() => Promise.resolve());
  const { rerender } = renderHook(({ cb }) => usePullToRefresh(cb), {
    initialProps: { cb: first },
  });
  act(() => {
    fireEvent.touchStart(document, touch(100));
    fireEvent.touchMove(document, touch(200));
  });
  rerender({ cb: second });
  act(() => {
    fireEvent.touchEnd(document);
  });
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
});
