import { beforeEach, describe, expect, test } from "vitest";
import type {
  ReceiptInput,
  ReceiptPayment,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import type { MockReceipt, MockState, MockUser } from "../db";
import { createSeedState } from "../seed-data";
import { debtAttention, debtsOf, toSupplierDebt } from "./debts";
import { applyReceipt } from "./receive";

const NOW = Date.UTC(2026, 10, 2, 3); // 2 Nov 2026 10.00 WIB
const DAY = 86_400_000;
let state: MockState;
let rina: MockUser;

const nanti = (dueDate: string): ReceiptPayment => ({
  timing: "nanti",
  method: null,
  cashSource: null,
  dueDate,
});
const transfer: ReceiptPayment = {
  timing: "sekarang",
  method: "transfer",
  cashSource: null,
  dueDate: null,
};

/** Nota satu baris Gula `qty` kg × `unitCost`; dicatat lewat `applyReceipt`. */
function receive(
  id: string,
  payment: ReceiptPayment,
  qty: number,
  unitCost: number,
  patch: Partial<ReceiptInput> = {},
): MockReceipt {
  const gula = state.products.find((p) => p.name === "Gula Pasir");
  const kg = gula?.units.find((u) => u.name === "kg");
  if (!gula || !kg) throw new Error("seed tanpa Gula kg");
  return applyReceipt(
    state,
    {
      id,
      supplierName: "Toko Grosir Makmur",
      notaDate: "2026-10-20",
      photoId: null,
      lines: [
        {
          lineId: "l1",
          productId: gula.id,
          unitId: kg.id,
          newProduct: null,
          qty,
          unitCost,
          expiryDate: null,
        },
      ],
      payment,
      ...patch,
    },
    rina,
    NOW,
  );
}

const paid = (r: MockReceipt, at: number) => {
  const stored = state.receipts.find((x) => x.id === r.id);
  if (!stored) throw new Error("nota hilang");
  stored.paid = { at, method: "transfer", cashSource: null, byName: "Ahmad" };
};

beforeEach(() => {
  state = createSeedState(NOW);
  const user = state.users.find((u) => u.name === "Rina");
  if (!user) throw new Error("seed tanpa Rina");
  rina = user;
});

describe("utang supplier (murni)", () => {
  test("debtsOf: hanya nanti & aktif; belum lunas urut jatuh tempo, lalu lunas terbaru dulu", () => {
    receive("tunai", transfer, 10, 16_000);
    const late = receive("c", nanti("2026-11-16"), 10, 16_000);
    const early = receive("a", nanti("2026-10-30"), 10, 16_000);
    const paidOld = receive("p1", nanti("2026-10-25"), 10, 16_000);
    const paidNew = receive("p2", nanti("2026-10-26"), 10, 16_000);
    const cancelled = receive("x", nanti("2026-10-21"), 10, 16_000);
    paid(paidOld, NOW - DAY);
    paid(paidNew, NOW);
    const stored = state.receipts.find((r) => r.id === cancelled.id);
    if (stored) stored.status = "dibatalkan";

    expect(debtsOf(state).map((r) => r.id)).toEqual([
      early.id,
      late.id,
      paidNew.id,
      paidOld.id,
    ]);
  });

  test("toSupplierDebt: amount = Σ qty × harga beli (bukan subtotal tersalin); nama supplier", () => {
    const r = receive("a", nanti("2026-10-30"), 50, 25_500);
    expect(toSupplierDebt(state, r)).toEqual({
      receiptId: "a",
      supplierName: "Toko Grosir Makmur",
      notaDate: "2026-10-20",
      amount: 1_275_000,
      dueDate: "2026-10-30",
      paid: null,
      photoId: null,
      createdAt: NOW,
      createdByName: "Rina",
    });
    const edited = structuredClone(r);
    const l = edited.lines[0];
    if (l) l.qty = 48;
    expect(toSupplierDebt(state, edited).amount).toBe(1_224_000);
  });

  test("debtAttention: lewat = setelah hari H; segera = 0–3 hari (termasuk hari H); lunas & dibatalkan tidak dihitung", () => {
    receive("lewat", nanti("2026-11-01"), 10, 10_000); // 100.000
    receive("hari-h", nanti("2026-11-02"), 20, 10_000); // 200.000
    receive("tiga", nanti("2026-11-05"), 30, 10_000); // 300.000
    receive("empat", nanti("2026-11-06"), 40, 10_000); // tidak dihitung
    paid(receive("lunas", nanti("2026-10-01"), 50, 10_000), NOW);
    receive("batal", nanti("2026-10-02"), 60, 10_000);
    const batal = state.receipts.find((r) => r.id === "batal");
    if (batal) batal.status = "dibatalkan";

    expect(debtAttention(state, NOW)).toEqual({
      overdueCount: 1,
      overdueTotal: 100_000,
      dueSoonCount: 2,
      dueSoonTotal: 500_000,
    });
  });

  test("debtAttention memakai tanggal Jakarta: 2 Nov 00.30 WIB (1 Nov UTC) → jatuh tempo 1 Nov sudah lewat", () => {
    receive("a", nanti("2026-11-01"), 10, 10_000);
    const earlyMorning = Date.UTC(2026, 10, 1, 17, 30);
    expect(debtAttention(state, earlyMorning).overdueCount).toBe(1);
    expect(debtAttention(state, earlyMorning - DAY).overdueCount).toBe(0);
  });
});
