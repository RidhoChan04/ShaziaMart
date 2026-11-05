import { expect, test } from "vitest";
import type { MockState } from "../db";
import { createSeedState } from "../seed-data";
import { applySampleStock } from "./sample";

/** Senin 2 Nov 2026 10.00 WIB. */
const NOW = Date.UTC(2026, 10, 2, 3);
const NAMES = [
  "Sari Roti Tawar",
  "Sari Roti Sobek Coklat",
  "Susu Kental Manis Frisian Flag 370 g",
  "Susu Bendera Kotak 200 ml",
];

const productNamed = (s: MockState, name: string) => {
  const p = s.products.find((x) => x.name === name);
  if (!p) throw new Error(`tanpa ${name}`);
  return p;
};
const snapshot = (s: MockState) => ({
  products: s.products.length,
  receipts: s.receipts.length,
  stockEntries: s.stockEntries.length,
  suppliers: s.suppliers.length,
  receiptAudit: s.receiptAudit.length,
});

test("applySampleStock: membuat 4 barang contoh aktif ber-harga & ber-HPP dan kiriman ber-ED K13; HPP barang seed lain tidak berubah; dipanggil dua kali tidak menggandakan", () => {
  const s = createSeedState(NOW);
  const seedCosts = new Map(s.products.map((p) => [p.id, p.cost]));
  applySampleStock(s, NOW);

  for (const name of NAMES) {
    const p = productNamed(s, name);
    expect(p.status).toBe("aktif");
    expect(p.units[0]?.price).toBeGreaterThan(0);
    expect(p.cost).not.toBeNull();
    expect(s.products.filter((x) => x.name === name)).toHaveLength(1);
  }
  expect(
    NAMES.map((n) => {
      const p = productNamed(s, n);
      return [p.category, p.units[0]?.name];
    }),
  ).toEqual([
    ["Roti & Biskuit", "bungkus"],
    ["Roti & Biskuit", "bungkus"],
    // Sudah ada di seed (dipakai ulang, satuannya tetap).
    ["Susu", "pcs"],
    ["Susu", "kotak"],
  ]);
  for (const [id, cost] of seedCosts) {
    expect(s.products.find((p) => p.id === id)?.cost).toEqual(cost);
  }

  const lots = s.receipts.flatMap((r) =>
    r.lines.map((l) => [r.id, l.productName, l.qty, r.notaDate, l.expiryDate]),
  );
  expect(lots).toEqual([
    ["contoh-stok-1", NAMES[3], 24, "2026-10-03", "2026-11-20"],
    ["contoh-stok-2", NAMES[2], 6, "2026-10-12", "2026-11-15"],
    ["contoh-stok-3", NAMES[0], 3, "2026-10-26", "2026-10-31"],
    ["contoh-stok-4", NAMES[1], 5, "2026-10-30", "2026-11-04"],
    ["contoh-stok-5", NAMES[3], 12, "2026-10-31", "2026-12-20"],
  ]);
  expect(
    [NAMES[0], NAMES[1], NAMES[3]].map(
      (n) => s.stock[productNamed(s, n ?? "").id],
    ),
  ).toEqual([3, 5, 14]);
  // Setiap kiriman tercatat di ledger sebagai barang masuk pada jam notanya.
  expect(
    s.stockEntries
      .filter((e) => e.kind === "masuk")
      .map((e) => [e.receiptId, e.lineId, e.qtyBase, e.at === e.effectiveAt]),
  ).toEqual([
    ["contoh-stok-1", "l1", 24, true],
    ["contoh-stok-2", "l1", 6, true],
    ["contoh-stok-3", "l1", 3, true],
    ["contoh-stok-4", "l1", 5, true],
    ["contoh-stok-5", "l1", 12, true],
  ]);

  const once = snapshot(s);
  applySampleStock(s, NOW + 60_000);
  expect(snapshot(s)).toEqual(once);
});
