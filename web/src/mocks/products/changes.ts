import type {
  PriceHistoryEntry,
  PriceSource,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { newId } from "@/shared/lib/id";
import { formatRupiah } from "@/shared/lib/money";
import { activeBigUnit, unitCost } from "@/shared/lib/product-rules";
import { formatQty } from "@/shared/lib/quantity";
import type { MockProduct, MockUnit } from "../db";
import { sameCost } from "./cost-alert";
import { eceranOf } from "./views";

const NONE = "—";
const rp = (n: number | null): string => (n === null ? NONE : formatRupiah(n));

/** Nilai yang ditampilkan di kolom changes, urut sesuai aturan 8. */
function facts(p: MockProduct, minStock: number | null): string[] {
  const eceran = eceranOf(p);
  const big = activeBigUnit(p);
  const tier = eceran.wholesaleTiers[0];
  return [
    p.category ?? NONE,
    eceran.name,
    eceran.barcodes[0] ?? NONE,
    rp(unitCost(p.cost, eceran.unitSize)),
    rp(eceran.price),
    tier ? `beli ${tier.minQty} · ${rp(tier.price)}` : NONE,
    big
      ? `${big.name} isi ${big.unitSize / eceran.unitSize} · ${rp(big.price)}`
      : NONE,
    big?.barcodes[0] ?? NONE,
    minStock === null
      ? NONE
      : formatQty(minStock, eceran.unitSize, eceran.name),
  ];
}

/**
 * HPP berubah tetapi modal eceran terbulatkan sama (mis. dus 104000 → 104010, isi 40):
 * tampilkan modal di satuan sumber HPP baru, lalu lama, yang bedanya terlihat.
 */
function exactCostChange(before: MockProduct, after: MockProduct): string[] {
  const a = before.cost;
  const b = after.cost;
  if (a === null || b === null || sameCost(a, b)) return [];
  for (const size of [b.qtyBase, a.qtyBase]) {
    const from = unitCost(a, size);
    const to = unitCost(b, size);
    const unit = [after, before]
      .flatMap((p) => p.units)
      .find((u) => u.active && u.unitSize === size);
    if (unit === undefined || from === to) continue;
    const eceran =
      unit.id === eceranOf(after).id || unit.id === eceranOf(before).id;
    const label = eceran ? "Harga modal" : `Harga modal ${unit.name}`;
    return [`${label} ${rp(from)} → ${rp(to)}`];
  }
  return [];
}

/** "{Label} {lama} → {baru}" untuk setiap nilai yang berbeda. */
export function changesOf(
  before: MockProduct,
  beforeMin: number | null,
  after: MockProduct,
  afterMin: number | null,
): string[] {
  const bigName = (activeBigUnit(after) ?? activeBigUnit(before))?.name;
  const labels = [
    "Kategori",
    "Dijual per",
    "Barcode",
    "Harga modal",
    "Harga jual",
    "Grosir",
    "Satuan besar",
    `Barcode ${bigName}`,
    "Batas stok menipis",
  ];
  const old = facts(before, beforeMin);
  const next = facts(after, afterMin);
  return labels.flatMap((label, i) => {
    if (old[i] !== next[i]) return [`${label} ${old[i]} → ${next[i]}`];
    return label === "Harga modal" ? exactCostChange(before, after) : [];
  });
}

type PriceLine = {
  unit: MockUnit;
  isEceran: boolean;
  tierMinQty: number | null;
  price: number;
};

/** Baris harga satuan aktif: harga normal lalu tiap tier; kunci `(unitId, tierMinQty)`. */
function priceLines(p: MockProduct): Map<string, PriceLine> {
  const lines = new Map<string, PriceLine>();
  p.units.forEach((unit, i) => {
    if (!unit.active) return;
    const isEceran = i === 0;
    lines.set(`${unit.id}:`, {
      unit,
      isEceran,
      tierMinQty: null,
      price: unit.price,
    });
    for (const t of unit.wholesaleTiers) {
      lines.set(`${unit.id}:${t.minQty}`, {
        unit,
        isEceran,
        tierMinQty: t.minQty,
        price: t.price,
      });
    }
  });
  return lines;
}

/** Riwayat harga: baris berubah/ditambah (urut barang baru) lalu baris dihapus. */
export function priceEntriesOf(
  before: MockProduct,
  after: MockProduct,
  source: PriceSource,
  now: number,
): PriceHistoryEntry[] {
  const old = priceLines(before);
  const next = priceLines(after);
  const entry = (
    line: PriceLine,
    oldPrice: number | null,
    newPrice: number | null,
  ): PriceHistoryEntry => ({
    id: newId(now),
    at: now,
    unitId: line.unit.id,
    unitName: line.unit.name,
    isEceran: line.isEceran,
    unitSize: line.unit.unitSize,
    tierMinQty: line.tierMinQty,
    oldPrice,
    newPrice,
    source,
  });
  const entries: PriceHistoryEntry[] = [];
  for (const [k, line] of next) {
    const prev = old.get(k)?.price ?? null;
    if (prev !== line.price) entries.push(entry(line, prev, line.price));
  }
  for (const [k, line] of old) {
    if (!next.has(k)) entries.push(entry(line, line.price, null));
  }
  return entries;
}
