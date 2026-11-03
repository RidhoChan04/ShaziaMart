import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { SCAN_FORMATS, useBarcodeSupport } from "./use-barcode-support";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("tanpa BarcodeDetector → false", () => {
  const { result } = renderHook(() => useBarcodeSupport());
  expect(result.current).toBe(false);
});

test("BarcodeDetector yang memuat ean_13 → true setelah getSupportedFormats selesai", async () => {
  vi.stubGlobal("BarcodeDetector", {
    getSupportedFormats: () => Promise.resolve(["ean_13"]),
  });
  const { result } = renderHook(() => useBarcodeSupport());
  expect(result.current).toBe(false);
  await waitFor(() => expect(result.current).toBe(true));
});

test("BarcodeDetector tanpa ean_13 atau gagal → tetap false", async () => {
  vi.stubGlobal("BarcodeDetector", {
    getSupportedFormats: () => Promise.resolve(["qr_code"]),
  });
  const a = renderHook(() => useBarcodeSupport());
  vi.stubGlobal("BarcodeDetector", {
    getSupportedFormats: () => Promise.reject(new Error("x")),
  });
  const b = renderHook(() => useBarcodeSupport());
  await new Promise((r) => setTimeout(r, 20));
  expect(a.result.current).toBe(false);
  expect(b.result.current).toBe(false);
});

test("SCAN_FORMATS memuat itf untuk barcode dus 14 digit", () => {
  expect(SCAN_FORMATS).toEqual(["ean_13", "ean_8", "upc_a", "itf"]);
});
