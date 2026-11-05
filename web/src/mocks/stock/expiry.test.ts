import { expect, test } from "vitest";
import type { MockState } from "../db";
import { createSeedState } from "../seed-data";
import { expiryAttention, expiryLots } from "./expiry";
import { applySampleStock } from "./sample";

/** Senin 2 Nov 2026 10.00 WIB. */
const NOW = Date.UTC(2026, 10, 2, 3);
const TODAY = "2026-11-02";
const ROTI = "Sari Roti Tawar";
const SUSU = "Susu Bendera Kotak 200 ml";

function sampleState(): MockState {
  const s = createSeedState(NOW);
  applySampleStock(s, NOW);
  return s;
}
const idOf = (s: MockState, name: string): string => {
  const p = s.products.find((x) => x.name === name);
  if (!p) throw new Error(`tanpa ${name}`);
  return p.id;
};
function setExpiry(s: MockState, receiptId: string, expiryDate: string) {
  const line = s.receipts.find((r) => r.id === receiptId)?.lines[0];
  if (!line) throw new Error(`tanpa nota ${receiptId}`);
  line.expiryDate = expiryDate;
}
const rows = (s: MockState) =>
  expiryLots(s, TODAY).map((l) => [l.productName, l.stage, l.expiryDate]);

test.each([
  ["2026-11-01", "lewat"],
  ["2026-11-02", "segera"],
  ["2026-12-02", "segera"],
  ["2026-12-03", null],
])("K10: ED roti %s → tahap %s", (ed, stage) => {
  const s = sampleState();
  setExpiry(s, "contoh-stok-3", ed);
  expect(expiryLots(s, TODAY).find((l) => l.productName === ROTI)?.stage).toBe(
    stage ?? undefined,
  );
});

test("soonDays dari stockRules: 60 hari → kiriman B ikut tampil (perkiraan 12, A 2)", () => {
  const s = sampleState();
  s.stockRules.expirySoonDays = 60;
  expect(
    expiryLots(s, TODAY)
      .filter((l) => l.productName === SUSU)
      .map((l) => [l.receiptId, l.estimateQtyBase]),
  ).toEqual([
    ["contoh-stok-1", 2],
    ["contoh-stok-5", 12],
  ]);
});

test("urut lewat dulu lalu segera, masing-masing ED naik", () => {
  const s = sampleState();
  setExpiry(s, "contoh-stok-1", "2026-10-30");
  expect(rows(s)).toEqual([
    [SUSU, "lewat", "2026-10-30"],
    [ROTI, "lewat", "2026-10-31"],
    ["Sari Roti Sobek Coklat", "segera", "2026-11-04"],
    ["Susu Kental Manis Frisian Flag 370 g", "segera", "2026-11-15"],
  ]);
});

test("nota dibatalkan, perkiraan 0, dan stok minus tidak tampil", () => {
  const s = sampleState();
  const roti = s.receipts.find((r) => r.id === "contoh-stok-3");
  if (roti) roti.status = "dibatalkan";
  s.stock[idOf(s, SUSU)] = 12; // semua sisa di B (+48)
  s.stock[idOf(s, "Sari Roti Sobek Coklat")] = -4;
  expect(rows(s)).toEqual([
    ["Susu Kental Manis Frisian Flag 370 g", "segera", "2026-11-15"],
  ]);
});

test("perhatian expiry: barang berbeda per tahap", () => {
  const s = sampleState();
  expect(expiryAttention(s, NOW)).toEqual({
    expiredCount: 1,
    soonCount: 3,
    soonDays: 30,
  });
  // Dua kiriman susu di tahap segera tetap dihitung satu barang.
  s.stockRules.expirySoonDays = 60;
  expect(expiryAttention(s, NOW)).toMatchObject({ soonCount: 3, soonDays: 60 });
  // Susu punya kiriman lewat (A) dan segera (B): masuk keduanya.
  setExpiry(s, "contoh-stok-1", "2026-11-01");
  expect(expiryAttention(s, NOW)).toEqual({
    expiredCount: 2,
    soonCount: 3,
    soonDays: 60,
  });
});

test("seed tanpa nota ber-ED: kosong", () => {
  const s = createSeedState(NOW);
  expect(expiryLots(s, TODAY)).toEqual([]);
  expect(expiryAttention(s, NOW)).toEqual({
    expiredCount: 0,
    soonCount: 0,
    soonDays: 30,
  });
});
