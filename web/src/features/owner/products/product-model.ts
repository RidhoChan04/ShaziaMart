import type { OwnerProductRow } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatQty } from "@/shared/lib/quantity";

export type ProductFilter = {
  q: string;
  kategori: string | null;
  nonaktif: boolean;
};

const NO_CATEGORY = "Tanpa kategori";

const categoryLabel = (row: Pick<OwnerProductRow, "category">): string =>
  row.category ?? NO_CATEGORY;

/** q: tanpa beda huruf pada nama, kode toko, dan tiap barcode; nonaktif memisahkan dua daftar. */
export function filterProducts(
  rows: OwnerProductRow[],
  f: ProductFilter,
): OwnerProductRow[] {
  const q = f.q.trim().toLowerCase();
  return rows.filter((r) => {
    if ((r.status === "nonaktif") !== f.nonaktif) return false;
    if (f.kategori !== null && categoryLabel(r) !== f.kategori) return false;
    if (q === "") return true;
    return (
      r.name.toLowerCase().includes(q) ||
      r.storeCode.toLowerCase().includes(q) ||
      r.barcodes.some((b) => b.includes(q))
    );
  });
}

/** Chip kategori dari barang yang tidak nonaktif, urut abjad label. */
export function categoryChips(
  rows: OwnerProductRow[],
): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (r.status === "nonaktif") continue;
    const label = categoryLabel(r);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => a.label.localeCompare(b.label, "id"));
}

export type Badge = {
  key:
    | "minus"
    | "menipis"
    | "langka"
    | "tidak_diambil"
    | "belum_dihitung"
    | "nonaktif";
  label: string;
  tone: "danger" | "warning" | "neutral";
};

/** Tanda status barang, urut seperti `Badge.key`. */
export function productBadges(
  p: Pick<OwnerProductRow, "status" | "scarce" | "stockCounted" | "stockAlert">,
): Badge[] {
  const out: Badge[] = [];
  if (p.stockAlert === "minus")
    out.push({ key: "minus", label: "Minus", tone: "danger" });
  if (p.stockAlert === "menipis")
    out.push({ key: "menipis", label: "Menipis", tone: "warning" });
  if (p.scarce)
    out.push({ key: "langka", label: "Sedang langka", tone: "neutral" });
  if (p.status === "tidak_diambil")
    out.push({
      key: "tidak_diambil",
      label: "Tidak diambil lagi",
      tone: "neutral",
    });
  if (!p.stockCounted)
    out.push({
      key: "belum_dihitung",
      label: "Stok belum dihitung",
      tone: "neutral",
    });
  if (p.status === "nonaktif")
    out.push({ key: "nonaktif", label: "Nonaktif", tone: "neutral" });
  return out;
}

/** `Stok 86,5 kg`; null bila stok belum dihitung (tidak ada angka yang bisa dipercaya). */
export function stockText(row: OwnerProductRow): string | null {
  if (!row.stockCounted) return null;
  return `Stok ${formatQty(row.stock, row.unitSize, row.unitName)}`;
}
