import { expect, test } from "vitest";
import type { SupplierDebt } from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  dueText,
  groupBySupplier,
  paidText,
  unpaidSummary,
} from "./debt-model";

const TODAY = "2026-11-02";

const debt = (over: Partial<SupplierDebt>): SupplierDebt => ({
  receiptId: "x",
  supplierName: "Toko Grosir Makmur",
  notaDate: "2026-10-20",
  amount: 1_275_000,
  dueDate: "2026-10-30",
  paid: null,
  photoId: null,
  createdAt: 0,
  createdByName: "Rina",
  ...over,
});

const A = debt({ receiptId: "a" });
const B = debt({ receiptId: "b", amount: 1_370_000, dueDate: "2026-11-11" });
const C = debt({
  receiptId: "c",
  supplierName: "CV Sumber Rejeki",
  amount: 1_442_000,
  dueDate: "2026-11-16",
});

test.each([
  ["2026-11-11", "Jatuh tempo 11 Nov · 9 hari lagi"],
  ["2026-11-02", "Jatuh tempo 2 Nov · hari ini"],
  ["2026-10-30", "Jatuh tempo 30 Okt"],
])("dueText %s", (due, expected) => {
  expect(dueText(due, TODAY)).toBe(expected);
});

test("unpaidSummary menghitung hanya yang belum lunas", () => {
  const paid = debt({
    receiptId: "p",
    paid: { at: 1, method: "transfer", cashSource: null, byName: "Budi" },
  });
  expect(unpaidSummary([A, B, C, paid], TODAY)).toEqual({
    total: 4_087_000,
    notes: 3,
    suppliers: 2,
    overdue: 1,
  });
  expect(unpaidSummary([], TODAY)).toEqual({
    total: 0,
    notes: 0,
    suppliers: 0,
    overdue: 0,
  });
});

test("groupBySupplier: belum lunas saja, jatuh tempo terdekat dulu", () => {
  const paid = debt({
    receiptId: "p",
    supplierName: "Agen Lain",
    paid: { at: 1, method: "tunai", cashSource: "pemilik", byName: "Budi" },
  });
  const groups = groupBySupplier([C, paid, B, A]);
  expect(
    groups.map((g) => [
      g.supplierName,
      g.total,
      g.debts.map((d) => d.receiptId),
    ]),
  ).toEqual([
    ["Toko Grosir Makmur", 2_645_000, ["a", "b"]],
    ["CV Sumber Rejeki", 1_442_000, ["c"]],
  ]);
});

test("paidText: tanggal lunas kalender Jakarta + cara bayar (R31)", () => {
  // 16.59 UTC = 23.59 WIB (masih 2 Nov); 17.00 UTC = 00.00 WIB (3 Nov).
  const at = (hourUtc: number, minute: number) =>
    Date.UTC(2026, 10, 2, hourUtc, minute);
  expect(
    paidText({
      at: at(16, 59),
      method: "tunai",
      cashSource: "laci",
      byName: "Pak Ahmad",
    }),
  ).toBe("Lunas 2 Nov 2026 · Tunai · Dari laci kasir");
  expect(
    paidText({
      at: at(17, 0),
      method: "transfer",
      cashSource: null,
      byName: "Pak Ahmad",
    }),
  ).toBe("Lunas 3 Nov 2026 · Transfer");
});
