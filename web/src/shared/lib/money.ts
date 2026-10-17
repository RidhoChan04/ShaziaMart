function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+$)/g, ".");
}

function assertSafeInteger(n: number): void {
  if (!Number.isSafeInteger(n)) {
    throw new RangeError(`Nominal harus bilangan bulat aman: ${n}`);
  }
}

/** Angka dengan pemisah ribuan titik, tanpa "Rp" (untuk kolom tabel). */
export function formatAngka(n: number): string {
  assertSafeInteger(n);
  const sign = n < 0 ? "-" : "";
  return sign + groupThousands(String(Math.abs(n)));
}

/** `12500` -> `Rp12.500`, `-5000` -> `-Rp5.000`. */
export function formatRupiah(n: number): string {
  assertSafeInteger(n);
  const sign = n < 0 ? "-" : "";
  return `${sign}Rp${groupThousands(String(Math.abs(n)))}`;
}

/** Menerima digit dengan/tanpa titik ribuan dan awalan `Rp`; selain itu `null`. */
export function parseRupiah(input: string): number | null {
  const s = input.trim().replace(/^Rp/i, "").trim();
  if (!/^(\d{1,3}(\.\d{3})+|\d+)$/.test(s)) return null;
  const n = Number(s.replaceAll(".", ""));
  return Number.isSafeInteger(n) ? n : null;
}
