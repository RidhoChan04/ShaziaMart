import type { OwnerSale } from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  formatIsoDate,
  isIsoDate,
  jakartaIsoDate,
} from "@/shared/lib/business-day";
import { formatRupiah } from "@/shared/lib/money";
import { formatQty } from "@/shared/lib/quantity";

const WEEKDAY = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  weekday: "long",
});

/** `Kamis, 5 Nov 2026` untuk tanggal kalender ISO. */
export function saleDayLabel(iso: string): string {
  return `${WEEKDAY.format(Date.parse(`${iso}T12:00:00+07:00`))}, ${formatIsoDate(iso)}`;
}

/** Tanggal yang ditunjuk nomor struk lengkap (`20261104-0145`), atau null bila `q` bukan nomor struk. */
export function receiptDate(q: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})-/.exec(q.trim());
  const iso = m ? `${m[1]}-${m[2]}-${m[3]}` : null;
  return iso && isIsoDate(iso) ? iso : null;
}

/** Tanggal daftar: nomor struk lengkap (`20261104-0145`) menunjuk harinya sendiri; selain itu `tanggal`, bawaan hari ini. */
export function effectiveDate(
  tanggal: string | undefined,
  q: string,
  now: number,
): string {
  const fromNumber = receiptDate(q);
  if (fromNumber) return fromNumber;
  return tanggal && isIsoDate(tanggal) ? tanggal : jakartaIsoDate(now);
}

/** Jumlah barang dalam satuan jualnya: `2 pcs`, `1,5 kg`. */
export function itemQty(i: OwnerSale["items"][number]): string {
  return formatQty(i.qtyBase, i.unitSize, i.unitName);
}

const PAYMENT_LABEL = {
  cash: "Tunai",
  qris: "QRIS",
  credit: "Kasbon",
} as const;

/** Baris pembayaran: `Tunai` / `QRIS` / `Kasbon {pelanggan}` dengan nominalnya. */
export function paymentLines(
  sale: Pick<OwnerSale, "payments" | "customerName">,
): { label: string; amount: string }[] {
  return sale.payments.map((p) => ({
    label:
      p.method === "credit" && sale.customerName
        ? `${PAYMENT_LABEL.credit} ${sale.customerName}`
        : PAYMENT_LABEL[p.method],
    amount: formatRupiah(p.amount),
  }));
}

/** Nominal bagian kasbon / QRIS transaksi (0 bila tak ada). */
export const partOf = (
  sale: Pick<OwnerSale, "payments">,
  method: "cash" | "qris" | "credit",
): number => sale.payments.find((p) => p.method === method)?.amount ?? 0;
