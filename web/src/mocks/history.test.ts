import { describe, expect, test } from "vitest";
import {
  businessDay,
  DAY_MS,
  daysBefore,
  HOUR_MS,
} from "@/shared/lib/business-day";
import type { MockSale } from "./db";
import { balanceOf, oldestUnpaidAt } from "./ledger";
import { formatSaleNumber } from "./sale-number";
import { saleCost } from "./sale-rules";
import { createSeedState } from "./seed-data";

/** Jumat 23 Okt 2026 14.30 WIB. */
const NOW = Date.UTC(2026, 9, 23, 7, 30);
const today = businessDay(NOW);
const state = createSeedState(NOW);
const byDay = new Map<string, MockSale[]>();
for (const s of state.sales) {
  const key = businessDay(s.createdAt).key;
  byDay.set(key, [...(byDay.get(key) ?? []), s]);
}
const hourOf = (ms: number) =>
  Math.floor((ms - businessDay(ms).start) / HOUR_MS);

describe("riwayat 14 hari", () => {
  test("hanya 14 hari sebelum hari ini; hari ini kosong", () => {
    const expected = Array.from(
      { length: 14 },
      (_, i) => daysBefore(today, i + 1).key,
    );
    expect([...byDay.keys()].sort()).toEqual(expected.sort());
    expect(byDay.has(today.key)).toBe(false);
    expect(state.saleSeq[today.key]).toBeUndefined();
    expect(state.closedShifts.every((c) => c.closedAt < today.start)).toBe(
      true,
    );
  });

  test("deterministik untuk tanggal bisnis yang sama (tak peduli milidetik); katalog tak berubah", () => {
    const later = createSeedState(NOW + 3 * 60_000);
    expect(later.sales).toEqual(state.sales);
    expect(later.closedShifts).toEqual(state.closedShifts);
    expect(later.products).toEqual(state.products);
    expect(createSeedState(NOW + 9 * DAY_MS).products).toEqual(state.products);
  });

  test("volume harian 40-160 (akhir pekan x1,3), jam 06-21, nomor struk berurutan", () => {
    for (const [key, sales] of byDay) {
      const weekend = businessDay(sales[0]?.createdAt ?? 0).weekday % 6 === 0;
      expect(sales.length).toBeGreaterThanOrEqual(weekend ? 52 : 40);
      expect(sales.length).toBeLessThanOrEqual(weekend ? 208 : 160);
      expect(state.saleSeq[key]).toBe(sales.length);
      sales.forEach((s, i) => {
        expect(s.number).toBe(formatSaleNumber(s.createdAt, i + 1));
        const hour = hourOf(s.createdAt);
        expect(hour).toBeGreaterThanOrEqual(6);
        expect(hour).toBeLessThanOrEqual(20);
        expect(s.kasirName).toBe(hour < 13 ? "Rina" : "Budi");
      });
    }
  });

  test("penjualan konsisten: selesai, tercetak, total, HPP snapshot, pembayaran, kembalian", () => {
    for (const s of state.sales) {
      expect([s.status, s.printStatus]).toEqual(["selesai", "tercetak"]);
      expect(s.items.length).toBeGreaterThanOrEqual(1);
      expect(s.items.length).toBeLessThanOrEqual(6);
      expect(s.total).toBe(s.items.reduce((a, i) => a + i.subtotal, 0));
      expect(s.costTotal).toBe(saleCost(state.unitCosts, s.items));
      expect(s.payments.reduce((a, p) => a + p.amount, 0)).toBe(s.total);
      const cash = s.payments.find((p) => p.method === "cash")?.amount ?? 0;
      if (cash > 0) {
        expect(s.cashReceived % 5000).toBe(0);
        expect(s.cashReceived - cash).toBe(s.change);
        expect(s.change).toBeLessThan(10_000);
      } else {
        expect([s.cashReceived, s.change]).toEqual([0, 0]);
      }
    }
    const methods = state.sales.flatMap((s) => s.payments.map((p) => p.method));
    expect(new Set(methods)).toEqual(new Set(["cash", "qris", "credit"]));
  });

  test("kasbon riwayat hanya Mbak Dewi dan lunas semua; pelanggan lain tidak berubah (R5)", () => {
    const dewi = state.customers.find((c) => c.name === "Mbak Dewi");
    const credit = state.sales.filter((s) => s.customerId !== null);
    expect(credit.length).toBeGreaterThan(0);
    expect(credit.every((s) => s.customerId === dewi?.id)).toBe(true);
    expect(balanceOf(state, dewi?.id ?? "")).toBe(0);
    expect(dewi?.balance).toBe(0);
    expect(oldestUnpaidAt(state, dewi?.id ?? "")).toBeNull();
    for (const s of credit) {
      const own = state.creditLedger.find((e) => e.saleId === s.id);
      const repaid = state.creditLedger.filter(
        (e) =>
          e.customerId === dewi?.id &&
          e.saleId === null &&
          e.amount < 0 &&
          e.at > s.createdAt &&
          e.at <= s.createdAt + 7 * DAY_MS &&
          e.at < NOW,
      );
      expect(own?.amount).toBe(
        s.payments.find((p) => p.method === "credit")?.amount,
      );
      expect(repaid.length).toBeGreaterThan(0);
    }
    expect(
      state.customers.map((c) => [
        c.name,
        c.balance,
        oldestUnpaidAt(state, c.id),
      ]),
    ).toEqual([
      ["Bu Sari", 120_000, NOW - 40 * DAY_MS],
      ["Pak Joko", 290_000, NOW - 12 * DAY_MS],
      ["Mbak Dewi", 0, null],
      ["Pak Udin", 50_000, NOW - 35 * DAY_MS],
      ["Bu Tini", 640_000, NOW - 45 * DAY_MS],
    ]);
  });

  test("saldo Mbak Dewi tidak pernah melewati limit selama riwayat", () => {
    const dewi = state.customers.find((c) => c.name === "Mbak Dewi");
    let running = 0;
    const own = state.creditLedger
      .filter((e) => e.customerId === dewi?.id)
      .sort((a, b) => a.at - b.at);
    for (const e of own) {
      running += e.amount;
      expect(running).toBeLessThanOrEqual(dewi?.creditLimit ?? 0);
      expect(running).toBeGreaterThanOrEqual(0);
    }
  });

  test("2 shift tertutup per hari (Rina, Budi) dengan selisih dari {0,-5000,+2000}", () => {
    expect(state.closedShifts).toHaveLength(28);
    for (const c of state.closedShifts) {
      expect([0, -5000, 2000]).toContain(c.difference);
      expect(c.expectedCash).toBe(c.openingCash + c.cashSales);
      expect(c.countedCash).toBe(c.expectedCash + c.difference);
      expect(["Rina", "Budi"]).toContain(c.kasirName);
    }
    const day = daysBefore(today, 1);
    const rina = state.closedShifts.find(
      (c) => c.kasirName === "Rina" && businessDay(c.closedAt).key === day.key,
    );
    const rinaSales = (byDay.get(day.key) ?? []).filter(
      (s) => s.kasirName === "Rina",
    );
    expect(rina?.salesCount).toBe(rinaSales.length);
  });

  test("stok: 7 barang menipis tetap, fixture >= 20 satuan", () => {
    const low = state.products.filter(
      (p) => (state.stock[p.id] ?? 0) < (state.minStock[p.id] ?? 0),
    );
    expect(low).toHaveLength(7);
    for (const p of state.products.slice(0, 9)) {
      const size = p.units[0]?.unitSize ?? 1;
      expect(state.stock[p.id] ?? 0).toBeGreaterThanOrEqual(20 * size);
    }
  });
});
