import { describe, expect, test } from "vitest";
import type {
  OwnerReceiptRow,
  ReceiptAuditEntry,
  ReceiptLine,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  auditTitle,
  receiptBadge,
  receiptLineDetail,
  receiptRowDetail,
} from "./receipt-model";

const row = (patch: Partial<OwnerReceiptRow> = {}): OwnerReceiptRow => ({
  id: "r1",
  supplierName: "CV Sumber Rejeki",
  notaDate: "2026-11-02",
  total: 1_442_000,
  lineCount: 3,
  status: "aktif",
  payment: {
    timing: "sekarang",
    method: "tunai",
    cashSource: "laci",
    dueDate: null,
  },
  paid: null,
  createdAt: 1,
  createdByName: "Rina",
  editedByName: null,
  ...patch,
});

const nanti = {
  timing: "nanti",
  method: null,
  cashSource: null,
  dueDate: "2026-11-16",
} as const;

test("receiptRowDetail: tanggal, jumlah barang, pencatat", () => {
  expect(receiptRowDetail(row())).toBe("2 Nov 2026 · 3 barang · Rina");
});

test("receiptBadge: nanti belum lunas → 'Belum lunas'; dibatalkan → 'Dibatalkan'; sekarang → null", () => {
  expect(receiptBadge(row({ payment: nanti }))).toEqual({
    label: "Belum lunas",
    tone: "warning",
  });
  expect(receiptBadge(row({ status: "dibatalkan" }))).toEqual({
    label: "Dibatalkan",
    tone: "neutral",
  });
  expect(receiptBadge(row())).toBeNull();
});

test("receiptBadge: nanti yang sudah lunas tanpa tanda; dibatalkan menang atas belum lunas", () => {
  const paid = {
    at: 1,
    method: "transfer",
    cashSource: null,
    byName: "Pak Ahmad",
  } as const;
  expect(receiptBadge(row({ payment: nanti, paid }))).toBeNull();
  expect(
    receiptBadge(row({ payment: nanti, status: "dibatalkan" }))?.label,
  ).toBe("Dibatalkan");
});

describe("auditTitle", () => {
  test.each([
    ["buat", "Rina", "Dicatat oleh Rina"],
    ["ubah", "Rina", "Diubah oleh Rina"],
    ["batal", "Pak Ahmad", "Dibatalkan oleh Pak Ahmad"],
    ["lunas", "Pak Ahmad", "Ditandai lunas oleh Pak Ahmad"],
  ] as const)("%s", (action, actorName, title) => {
    const e: ReceiptAuditEntry = {
      id: "a",
      at: 1,
      actorName,
      action,
      changes: [],
    };
    expect(auditTitle(e)).toBe(title);
  });
});

test("receiptLineDetail: '2 dus × Rp112.000 · ED 20 Apr 2027'; tanpa ED tanpa ekor", () => {
  const line: ReceiptLine = {
    lineId: "l1",
    productId: "p",
    productName: "Indomie Goreng",
    unitId: "u",
    unitName: "dus",
    unitSize: 40,
    qty: 2,
    unitCost: 112_000,
    subtotal: 224_000,
    expiryDate: "2027-04-20",
    newProduct: false,
  };
  expect(receiptLineDetail(line)).toBe("2 dus × Rp112.000 · ED 20 Apr 2027");
  expect(receiptLineDetail({ ...line, expiryDate: null })).toBe(
    "2 dus × Rp112.000",
  );
});
