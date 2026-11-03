import { useEffect, useState } from "react";

/** Format yang dicari; itf untuk barcode dus 14 digit (GTIN-14). */
export const SCAN_FORMATS = ["ean_13", "ean_8", "upc_a", "itf"] as const;

/** Salah sampai BarcodeDetector ada dan sanggup membaca ean_13 (Safari iOS: tidak ada). */
export function useBarcodeSupport(): boolean {
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    let alive = true;
    if (typeof BarcodeDetector === "undefined") return;
    BarcodeDetector.getSupportedFormats().then(
      (formats) => {
        if (alive) setSupported(formats.includes("ean_13"));
      },
      () => {},
    );
    return () => {
      alive = false;
    };
  }, []);
  return supported;
}
