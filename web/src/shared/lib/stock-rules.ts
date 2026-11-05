import type {
  ExpiryStage,
  OpnameReason,
  OpnameScope,
} from "../api/gen/shaziaMartAPI.schemas";
import { isoDaysBetween } from "./business-day";
import { formatQty } from "./quantity";

export const OPNAME_REASON_LABEL: Record<OpnameReason, string> = {
  rusak: "Rusak",
  hilang: "Hilang",
  kedaluwarsa: "Kedaluwarsa",
  salah_input: "Salah input sebelumnya",
  tidak_diketahui: "Tidak diketahui",
};

/** Alasan yang dipilih staf (urutan chip); `tidak_diketahui` hanya hasil `salah_input` tanpa nota (J4). */
export const CHOOSABLE_REASONS = [
  "rusak",
  "hilang",
  "kedaluwarsa",
  "salah_input",
] as const satisfies readonly OpnameReason[];

/** `Mi Instan` · `Tanpa kategori` · `Semua barang`. */
export function scopeLabel(scope: OpnameScope): string {
  switch (scope.kind) {
    case "semua":
      return "Semua barang";
    case "tanpa_kategori":
      return "Tanpa kategori";
    case "kategori":
      if (scope.category === null) {
        throw new RangeError("Lingkup kategori tanpa nama kategori");
      }
      return scope.category;
  }
}

export const sameScope = (a: OpnameScope, b: OpnameScope): boolean =>
  a.kind === b.kind && (a.kind !== "kategori" || a.category === b.category);

/** Nama satuan untuk label penghitung: `dus` → `Dus`. */
export const unitLabel = (name: string): string =>
  name.charAt(0).toUpperCase() + name.slice(1);

/** Jumlah fisik dalam satuan dasar: Σ `count × unitSize`; RangeError bila tidak bulat/negatif/tidak aman. */
export function countedQtyBase(
  parts: readonly { unitSize: number; count: number }[],
): number {
  let total = 0;
  for (const { unitSize, count } of parts) {
    if (!Number.isSafeInteger(unitSize) || unitSize < 1) {
      throw new RangeError(`Isi satuan tidak sah: ${unitSize}`);
    }
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new RangeError(`Jumlah harus bilangan bulat non-negatif: ${count}`);
    }
    const qty = count * unitSize;
    total += qty;
    if (!Number.isSafeInteger(qty) || !Number.isSafeInteger(total)) {
      throw new RangeError("Jumlah di luar batas aman");
    }
  }
  return total;
}

/** Tahap ED (K10): `lewat` bila sebelum hari ini; `segera` bila 0–`soonDays` hari lagi; selain itu `null`. */
export function expiryStage(
  expiryDate: string,
  today: string,
  soonDays: number,
): ExpiryStage | null {
  if (!Number.isSafeInteger(soonDays) || soonDays < 0) {
    throw new RangeError(`Batas hari tidak sah: ${soonDays}`);
  }
  const days = isoDaysBetween(today, expiryDate);
  if (days < 0) return "lewat";
  return days <= soonDays ? "segera" : null;
}

/** `Lewat 2 hari` · `Hari ini` · `13 hari lagi`. */
export function expiryWhenText(expiryDate: string, today: string): string {
  const days = isoDaysBetween(today, expiryDate);
  if (days < 0) return `Lewat ${-days} hari`;
  return days === 0 ? "Hari ini" : `${days} hari lagi`;
}

/** `Kurang 7 pcs` · `Lebih 1,5 kg`; selisih nol bukan selisih → RangeError. */
export function diffBadgeText(
  diffQtyBase: number,
  unitSize: number,
  unitName: string,
): string {
  if (diffQtyBase === 0) throw new RangeError("Selisih nol tidak punya tanda");
  const qty = formatQty(Math.abs(diffQtyBase), unitSize, unitName);
  return diffQtyBase < 0 ? `Kurang ${qty}` : `Lebih ${qty}`;
}

/** `{jumlah}` yang dikeluarkan: bukan curah angka eceran tanpa satuan (`6`), curah `1,5 kg`. */
export function removedText(
  qtyBase: number,
  unitSize: number,
  unitName: string,
  isCurah: boolean,
): string {
  if (!Number.isSafeInteger(qtyBase) || qtyBase < 1) {
    throw new RangeError(`Jumlah dikeluarkan minimal 1: ${qtyBase}`);
  }
  return isCurah
    ? formatQty(qtyBase, unitSize, unitName)
    : formatQty(qtyBase, unitSize, "").trimEnd();
}
