import type {
  DrawerShift,
  ReceiptError,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { jakartaTime } from "@/shared/lib/business-day";
import { formatRupiah } from "@/shared/lib/money";
import { receiptTotal } from "@/shared/lib/receipt-rules";
import type { DraftPhoto, ReceiptForm } from "../drafts/draft-types";
import { parseCost } from "./line-model";

/** Pilihan cepat jatuh tempo, dalam hari sejak tanggal nota. */
export const DUE_CHIPS = [7, 14, 30] as const;

export const lineCount = (f: ReceiptForm): number => f.lines.length;

/** Total semua baris; null bila ada harga yang belum terbaca. */
export function formTotal(f: ReceiptForm): number | null {
  const costs: { qty: number; unitCost: number }[] = [];
  for (const line of f.lines) {
    const unitCost = parseCost(line.unitCostText);
    if (unitCost === null || unitCost < 0) return null;
    costs.push({ qty: line.qty, unitCost });
  }
  try {
    return receiptTotal(costs);
  } catch {
    return null; // di luar batas aman: aturan nota menolak dengan pesan angka terlalu besar
  }
}

/** Catatan di bawah pilihan laci; null bila tidak ada shift buka. */
export function drawerNote(
  shift: DrawerShift | null,
  total: number,
): string | null {
  if (shift === null) return null;
  return `Dicatat sebagai uang keluar di shift ${shift.kasirName} (buka ${jakartaTime(shift.openedAt)}). Di tutup shift muncul Bayar supplier −${formatRupiah(total)}.`;
}

/** "Diambil 14.12 · 214 KB". */
export function photoCaption(p: DraftPhoto): string {
  return `Diambil ${jakartaTime(p.takenAt)} · ${Math.round(p.bytes / 1024)} KB`;
}

/** Galat tingkat nota atau baris dibetulkan di langkah nota; sisanya (pembayaran) di langkah bayar. */
export const onNotaStep = (e: ReceiptError): boolean =>
  e.lineId !== null ||
  ["supplierName", "notaDate", "lines", "photoId"].includes(e.field);
