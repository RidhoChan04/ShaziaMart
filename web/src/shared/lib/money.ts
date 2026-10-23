import { roundHalfUp } from "./quantity";

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

/** Per sepuluhan satuan, koma Indonesia: `125` -> `12,5`, `120` -> `12`. */
function formatTenths(tenths: number): string {
  const frac = tenths % 10;
  const whole = formatAngka((tenths - frac) / 10);
  return frac === 0 ? whole : `${whole},${frac}`;
}

/** Ringkas untuk ruang sempit: `12500` -> `Rp12,5 rb`, `4872500` -> `Rp4,9 jt`. */
export function formatRupiahShort(n: number): string {
  assertSafeInteger(n);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs < 1000) return `${sign}Rp${abs}`;
  const thousandTenths = roundHalfUp(abs, 100);
  // 999.950 dibulatkan ke 1.000,0 rb; tampil sebagai jt.
  if (thousandTenths < 10000)
    return `${sign}Rp${formatTenths(thousandTenths)} rb`;
  return `${sign}Rp${formatTenths(roundHalfUp(abs, 100000))} jt`;
}
