import { type KeyboardEvent, useRef, useState } from "react";

// Sama dengan detektor scan: digit berjarak < 30 ms datang dari scanner, bukan tangan.
const SCAN_GAP_MS = 30;

/**
 * Menolak rentetan scanner keyboard-wedge di kolom angka. Digit pertama rentetan
 * sempat masuk; mulai digit kedua semua tombol (termasuk Enter penutupnya) dibuang
 * dan `restore` dipanggil dengan isian sebelum rentetan dimulai.
 */
export function useScanGuard(restore: (before: string) => void) {
  const [scanned, setScanned] = useState(false);
  const lastDigitAt = useRef(Number.NEGATIVE_INFINITY);
  const before = useRef("");

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const digit = /^\d$/.test(e.key);
    if (!digit && e.key !== "Enter") return;
    const now = performance.now();
    const burst = now - lastDigitAt.current < SCAN_GAP_MS;
    if (digit) lastDigitAt.current = now;
    if (burst) {
      e.preventDefault();
      restore(before.current);
      setScanned(true);
    } else if (digit) {
      before.current = e.currentTarget.value;
      setScanned(false);
    }
  };

  return { onKeyDown, scanned, reset: () => setScanned(false) };
}
