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
  // Stok awal 40 − 14 = 26 bks; Kecap 7 + 2 = 9 pcs; ledger = stok.
  expect(s.stock[rokok.id]).toBe(26);
  expect(s.stock[kecap.id]).toBe(9);
  expect(stockAt(s, rokok.id, wib("2026-10-28", 8))).toBe(0);
  expect(stockAt(s, rokok.id, wib("2026-11-02", 9))).toBe(40);
  expect(stockAt(s, kecap.id, wib("2026-11-04", 10))).toBe(7);
  // systemQtyBase tiap hitungan = stok menurut ledger tepat sebelum jam hitungnya.
  for (const session of s.opnameSessions) {
    for (const item of session.items) {
      expect(item.systemQtyBase).toBe(
        stockAt(s, item.productId, item.countedAt - 1),
      );
      expect(item.countedQtyBase - item.systemQtyBase).toBe(item.diffQtyBase);
    }
  }
  expect(s.opnameSessions.every((x) => x.status === "selesai")).toBe(true);

  const snapshot = JSON.stringify(s);
  applySampleOpname(s, NOW);
  expect(JSON.stringify(s)).toBe(snapshot);
  expect(s.products).toHaveLength(products + 2);
});
