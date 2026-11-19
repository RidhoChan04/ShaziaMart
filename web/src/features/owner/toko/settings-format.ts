import { formatAngka, parseRupiah } from "@/shared/lib/money";

/** Jenis isian angka: uang (titik = ribuan), persen (koma = desimal, satu angka), angka biasa (jam, hari). */
export type NumberKind = "money" | "percent" | "plain";

export type Parsed = { value: number } | { error: string };

export const MONEY_ERROR =
  "Isi dengan bilangan bulat, titik hanya untuk ribuan";
export const PLAIN_ERROR = "Isi dengan angka saja";
export const PERCENT_ERROR =
  "Isi persen bulat atau dengan satu angka di belakang koma";
export const PERCENT_DOT_ERROR = "Gunakan koma untuk desimal";

/** Persen dari permil: 100 → "10", 125 → "12,5". */
export function formatPercent(permille: number): string {
  const whole = Math.trunc(permille / 10);
  const frac = permille % 10;
  return frac === 0 ? String(whole) : `${whole},${frac}`;
}

/** Ketikan → nilai: uang rupiah, permil untuk persen ("15" → 150, "12,5" → 125), atau angka biasa. */
export function parseNumber(kind: NumberKind, text: string): Parsed {
  const s = text.trim();
  if (kind === "money") {
    const n = parseRupiah(s);
    return n === null ? { error: MONEY_ERROR } : { value: n };
  }
  if (kind === "plain") {
    return /^\d{1,9}$/.test(s) ? { value: Number(s) } : { error: PLAIN_ERROR };
  }
  if (s.includes(".")) return { error: PERCENT_DOT_ERROR };
  const m = /^(\d{1,3})(?:,(\d))?$/.exec(s);
  if (!m) return { error: PERCENT_ERROR };
  return { value: Number(m[1]) * 10 + Number(m[2] ?? 0) };
}

/** Isian awal dari nilai tersimpan. */
export function formatNumber(kind: NumberKind, value: number): string {
  if (kind === "money") return formatAngka(value);
  if (kind === "percent") return formatPercent(value);
  return String(value);
}
