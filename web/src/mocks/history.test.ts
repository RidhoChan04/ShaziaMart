import { describe, expect, test } from "vitest";
import {
  businessDay,
  DAY_MS,
  daysBefore,
  HOUR_MS,
  isoDaysBetween,
  jakartaIsoDate,
} from "@/shared/lib/business-day";
import type { MockSale, MockState } from "./db";
import { HISTORY_DAYS, SLOW_PRODUCTS } from "./history";
import { balanceOf, oldestUnpaidAt } from "./ledger";
import { formatSaleNumber } from "./sale-number";
import { saleCost, saleLineCosts } from "./sale-rules";
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
/** Hari kalender WIB dari `at` sampai `now`. */
const daysAgo = (at: number, now = NOW) =>
  isoDaysBetween(jakartaIsoDate(at), jakartaIsoDate(now));

/** Barang tak pernah terjual (id) dan barang terakhir terjual ≥ 45 hari lalu (id + hari). */
function slowOf(s: Readonly<MockState>, now = NOW) {
  const productOf = new Map(
    s.products.flatMap((p) => p.units.map((u) => [u.id, p.id] as const)),
  );
  const lastSold = new Map<string, number>();
  for (const sale of s.sales) {
    for (const item of sale.items) {
      const id = productOf.get(item.unitId) ?? "";
      lastSold.set(id, Math.max(lastSold.get(id) ?? 0, sale.createdAt));
    }
  }
  const never = s.products.filter((p) => !lastSold.has(p.id)).map((p) => p.id);
  const old = s.products.flatMap((p) => {
    const at = lastSold.get(p.id);
    return at !== undefined && daysAgo(at, now) >= 45
      ? [{ id: p.id, days: daysAgo(at, now) }]
      : [];
  });
  return { never, old, lastSold };
}

describe("riwayat 63 hari", () => {
  test("riwayat 63 hari sebelum hari ini; hari ini kosong; tiap penjualan punya shiftId", () => {
    expect(HISTORY_DAYS).toBe(63);
    const expected = Array.from(
      { length: 63 },
      (_, i) => daysBefore(today, i + 1).key,
    );
    expect([...byDay.keys()].sort()).toEqual(expected.sort());
    expect(byDay.has(today.key)).toBe(false);
    expect(state.saleSeq[today.key]).toBeUndefined();
    expect(state.closedShifts.every((c) => c.closedAt < today.start)).toBe(
      true,
    );
    const shiftIds = new Set(state.closedShifts.map((c) => c.shiftId));
    expect(state.sales.every((s) => shiftIds.has(s.shiftId))).toBe(true);
    // (K11) katalog dianggap ada sejak awal hari riwayat pertama.
    expect(state.catalogSince).toBe(daysBefore(today, 63).start);
    expect(state.reportRules).toEqual({
      thinMarginPermille: 100,
      unsoldDays: 30,
    });
  });

  test("deterministik untuk tanggal bisnis yang sama (tak peduli milidetik); katalog tak berubah", () => {
    const later = createSeedState(NOW + 3 * 60_000);
    expect(later.sales).toEqual(state.sales);
    expect(later.closedShifts).toEqual(state.closedShifts);
    expect(later.products).toEqual(state.products);
    expect(createSeedState(NOW + 9 * DAY_MS).products).toEqual(state.products);
  });

  test("volume harian 20-60 (akhir pekan 26-78), jam 06-21, nomor struk berurutan", () => {
    for (const [key, sales] of byDay) {
      const weekend = businessDay(sales[0]?.createdAt ?? 0).weekday % 6 === 0;
      expect(sales.length).toBeGreaterThanOrEqual(weekend ? 26 : 20);
      expect(sales.length).toBeLessThanOrEqual(weekend ? 78 : 60);
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

  test("penjualan konsisten: selesai, tercetak, belum batal, total, HPP snapshot, pembayaran, kembalian", () => {
    for (const s of state.sales) {
      expect([s.status, s.printStatus]).toEqual(["selesai", "tercetak"]);
      expect(s.items.length).toBeGreaterThanOrEqual(1);
      expect(s.items.length).toBeLessThanOrEqual(6);
      expect(s.total).toBe(s.items.reduce((a, i) => a + i.subtotal, 0));
      expect(s.costTotal).toBe(saleCost(state.products, s.items));
      expect(s).toMatchObject({
        voidedAt: null,
        voidedById: null,
        voidedByName: null,
        voidReason: null,
        voidChannel: null,
        voidRefund: null,
        creditOverLimit: null,
      });
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

  test("(K10) lineCosts tiap penjualan riwayat sejajar items dan Σ = costTotal", () => {
    for (const s of state.sales) {
      expect(s.lineCosts).toHaveLength(s.items.length);
      expect(s.lineCosts).toEqual(saleLineCosts(state.products, s.items));
      expect(s.lineCosts.reduce<number>((a, c) => a + (c ?? 0), 0)).toBe(
        s.costTotal,
      );
    }
  });

  test("(K11) 6 barang lambat: 3 tidak pernah terjual, 3 terakhir terjual 45-63 hari lalu; tidak ada FIXTURES di antaranya", () => {
    expect(SLOW_PRODUCTS).toBe(6);
    const { never, old } = slowOf(state);
    expect(never).toHaveLength(3);
    expect(old).toHaveLength(3);
    for (const { days } of old) {
      expect(days).toBeGreaterThanOrEqual(45);
      expect(days).toBeLessThanOrEqual(63);
    }
    // FIXTURES (9 barang pertama, dipakai test & E2E) tidak pernah lambat; stok barang lambat > 0.
    const fixtures = new Set(state.products.slice(0, 9).map((p) => p.id));
    for (const id of [...never, ...old.map((p) => p.id)]) {
      expect(fixtures.has(id)).toBe(false);
      expect(state.stock[id] ?? 0).toBeGreaterThan(0);
    }
  });

  test("(K11) barang lain terjual dalam 30 hari terakhir; barang lambat sama untuk tanggal bisnis lain", () => {
    const { never, old, lastSold } = slowOf(state);
    const slow = new Set([...never, ...old.map((p) => p.id)]);
    for (const p of state.products) {
      if (slow.has(p.id)) continue;
      expect(daysAgo(lastSold.get(p.id) ?? 0), p.name).toBeLessThan(30);
    }
    const other = slowOf(createSeedState(NOW + 9 * DAY_MS), NOW + 9 * DAY_MS);
    expect(other.never).toEqual(never);
    expect(other.old.map((p) => p.id)).toEqual(old.map((p) => p.id));
  });

  test("(K11) ukuran state seed < 4.000.000 karakter JSON di 14 hari bisnis berturut-turut (kuota localStorage)", () => {
    const sizes = Array.from(
      { length: 14 },
      (_, i) => JSON.stringify(createSeedState(NOW + i * DAY_MS)).length,
    );
    for (const size of sizes) expect(size).toBeLessThan(4_000_000);
  });

  test("(T2b) setiap penjualan riwayat punya shiftId shift tutup kasirnya yang memuat jamnya; shift tumpang 13.00–13.05 tidak dipakai menebak", () => {
    const shifts = new Map(state.closedShifts.map((c) => [c.shiftId, c]));
    expect(shifts.size).toBe(state.closedShifts.length);
    for (const s of state.sales) {
      const shift = shifts.get(s.shiftId);
      expect(shift, s.number).toBeDefined();
      expect(shift?.kasirName).toBe(s.kasirName);
      expect(s.createdAt).toBeGreaterThanOrEqual(shift?.openedAt ?? Infinity);
      expect(s.createdAt).toBeLessThan(shift?.closedAt ?? -Infinity);
    }
    // salesCount & cashSales shift = penjualan yang menunjuk shift itu.
    for (const c of state.closedShifts) {
      const own = state.sales.filter((s) => s.shiftId === c.shiftId);
      expect(c.salesCount).toBe(own.length);
    }
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

  test("2 shift tertutup per hari (Rina, Budi) dengan selisih dari {0,-5000,+2000}; (S6) Rina 6 hari terakhir −4.000", () => {
    expect(state.closedShifts).toHaveLength(2 * 63);
    for (const c of state.closedShifts) {
      const back = daysAgo(c.openedAt);
      if (c.kasirName === "Rina" && back <= 6) {
        expect(c.difference).toBe(-4_000);
      } else {
        expect([0, -5000, 2000]).toContain(c.difference);
      }
      expect(c.expectedCash).toBe(
        c.openingCash + c.cashSales - c.expenses - c.ownerTakes,
      );
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

  test("closedShifts: openedAt Rina 06.00, Budi 13.00, < closedAt; pelunasan & pengembalian 0; invarian uang seharusnya", () => {
    for (const c of state.closedShifts) {
      // (S3) Contoh shift kelamaan Budi tutup lewat tengah malam: hari buka, bukan hari tutup.
      const day = businessDay(c.openedAt);
      expect(c.openedAt).toBe(
        day.start + (c.kasirName === "Rina" ? 6 : 13) * HOUR_MS,
      );
      expect(c.openedAt).toBeLessThan(c.closedAt);
      expect([c.creditPayments, c.saleRefunds]).toEqual([0, 0]);
      expect(c.expectedCash).toBe(
        c.openingCash +
          c.cashSales -
          c.supplierPayments +
          c.creditPayments -
          c.saleRefunds -
          c.expenses -
          c.ownerTakes,
      );
    }
  });

  test("pelunasan kasbon riwayat Mbak Dewi tercatat sebagai rekaman (Tunai, jalur kasir, Rina, tanpa shift)", () => {
    const dewi = state.customers.find((c) => c.name === "Mbak Dewi");
    const repayments = state.creditLedger.filter(
      (e) => e.customerId === dewi?.id && e.amount < 0,
    );
    expect(repayments.length).toBeGreaterThan(1);
    for (const e of repayments) {
      expect(e.paymentId).not.toBeNull();
      expect(
        state.creditPayments.find((p) => p.id === e.paymentId),
      ).toMatchObject({
        customerId: dewi?.id,
        amount: -e.amount,
        at: e.at,
        channel: "kasir",
        method: "tunai",
        createdByName: "Rina",
        shiftId: null,
        cancelledAt: null,
      });
    }
    // Kasbon penjualan tidak ber-paymentId.
    expect(
      state.creditLedger
        .filter((e) => e.saleId !== null)
        .every((e) => e.paymentId === null),
    ).toBe(true);
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
