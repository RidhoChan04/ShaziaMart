import { expect, test } from "vitest";
import type { OwnerCustomerRow } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { visibleCustomers } from "./kasbon-model";

const row = (
  name: string,
  phone: string,
  balance: number,
): OwnerCustomerRow => ({
  id: name,
  name,
  phone,
  balance,
  creditLimit: 500_000,
  oldestUnpaidAt: null,
  ageDays: null,
  age: null,
});

const rows = [
  row("Bu Tini", "081234500005", 640_000),
  row("Mbak Dewi", "081234500003", 0),
  row("Pak Bayar", "081234500099", -40_000),
];

test("tanpa pencarian: saldo 0 disembunyikan, urutan server dipertahankan", () => {
  expect(visibleCustomers(rows, "").map((r) => r.name)).toEqual([
    "Bu Tini",
    "Pak Bayar",
  ]);
  expect(visibleCustomers(rows, "   ")).toHaveLength(2);
});

test("pencarian: nama tanpa peduli huruf besar, termasuk yang lunas", () => {
  expect(visibleCustomers(rows, "DEWI").map((r) => r.name)).toEqual([
    "Mbak Dewi",
  ]);
});

test("pencarian: nomor HP dengan atau tanpa tanda baca", () => {
  expect(visibleCustomers(rows, "0812-3450-0099").map((r) => r.name)).toEqual([
    "Pak Bayar",
  ]);
  expect(visibleCustomers(rows, "500005").map((r) => r.name)).toEqual([
    "Bu Tini",
  ]);
  expect(visibleCustomers(rows, "zzz")).toEqual([]);
});
