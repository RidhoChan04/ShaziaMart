import { expect, test } from "vitest";
import { stockAt } from "../stock/stock-at";
import { blankState, NOW, productNamed, wib } from "./report-fixtures";
import { applySampleOpname, KECAP, ROKOK } from "./sample-opname";

test("applySampleOpname: barang contoh ber-HPP, sesi opname contoh, stok & ledger sejalan; dua kali tidak menggandakan", () => {
  const s = blankState();
  const products = s.products.length;
  applySampleOpname(s, NOW);
  const rokok = productNamed(s, ROKOK);
  const kecap = productNamed(s, KECAP);
  expect(rokok).toMatchObject({ status: "aktif", stockCounted: true });
  expect(rokok.units[0]).toMatchObject({ name: "bks", price: 24_000 });
  expect(rokok.cost).toEqual({ amount: 21_000, qtyBase: 1 });
  expect(kecap.cost).toEqual({ amount: 19_000, qtyBase: 1 });
  // Rokok: stok awal 40, −3, nota +10, −5, −6 (hitung ulang) = 36 bks; Kecap 7 + 2 = 9 pcs.
  expect(s.stock[rokok.id]).toBe(36);
  expect(s.stock[kecap.id]).toBe(9);
  expect(stockAt(s, rokok.id, wib("2026-10-28", 8))).toBe(0);
  expect(stockAt(s, rokok.id, wib("2026-11-02", 9))).toBe(40);
  expect(stockAt(s, rokok.id, wib("2026-11-02", 14))).toBe(47);
  expect(stockAt(s, kecap.id, wib("2026-11-04", 10))).toBe(7);
  // Ledger = stok sekarang: Σ entri barang contoh sama dengan stoknya (tanpa penjualan).
  for (const p of [rokok, kecap]) {
    const sum = s.stockEntries
      .filter((e) => e.productId === p.id)
      .reduce((a, e) => a + e.qtyBase, 0);
    expect(sum, p.name).toBe(s.stock[p.id]);
  }
  // systemQtyBase tiap hitungan (dan hitung ulang) = stok ledger tepat sebelum jam hitungnya.
  for (const session of s.opnameSessions) {
    for (const item of session.items) {
      expect(item.systemQtyBase).toBe(
        stockAt(s, item.productId, item.countedAt - 1),
      );
      expect(item.countedQtyBase - item.systemQtyBase).toBe(item.diffQtyBase);
      const r = item.recount;
      if (r) {
        expect(r.systemQtyBase).toBe(
          stockAt(s, item.productId, r.countedAt - 1),
        );
        expect(r.countedQtyBase - r.systemQtyBase).toBe(r.diffQtyBase);
      }
    }
  }
  expect(s.opnameSessions.every((x) => x.status === "selesai")).toBe(true);

  // Catatan orang toko di jeda (nota Rina) & hitung ulang pemilik untuk layar T13.
  const nota = s.receipts.find((r) => r.id === "contoh-opname-nota-1");
  expect(nota).toMatchObject({
    status: "aktif",
    createdByName: "Rina",
    createdAt: wib("2026-11-02", 14),
  });
  expect(nota?.lines[0]).toMatchObject({ productId: rokok.id, qty: 10 });
  const recounted = s.opnameSessions
    .flatMap((x) => x.items)
    .find((i) => i.state === "dihitung_ulang");
  expect(recounted).toMatchObject({
    productId: rokok.id,
    diffQtyBase: -8,
    resolvedByName: "Pak Ahmad",
    recount: { diffQtyBase: -6, countedAt: wib("2026-11-04", 12, 5) },
  });

  const snapshot = JSON.stringify(s);
  applySampleOpname(s, NOW);
  expect(JSON.stringify(s)).toBe(snapshot);
  expect(s.products).toHaveLength(products + 2);
});
