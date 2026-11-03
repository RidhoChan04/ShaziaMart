import { beforeEach, expect, test, vi } from "vitest";
import type { ShiftClosure } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { mockDb } from "../db";
import {
  json,
  loginWithShift,
  ownerLogin,
  post,
  receiptInput,
  staffLogin,
} from "./test-helpers";

const NOW = Date.UTC(2026, 10, 3, 3); // 3 Nov 2026 10.00 WIB
const OPENING = 1_500_000;
const TOTAL = 1_442_000;

const cashOuts = () =>
  (mockDb.get().shift?.cashOuts ?? []).map((c) => [c.kind, c.amount]);

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  await loginWithShift(OPENING);
  expect((await staffLogin()).status).toBe(200);
  expect((await ownerLogin()).status).toBe(200);
});

test("R23: Bayar nanti → pemilik lunas dari laci → pemilik batalkan nota → uang keluar shift bersih 0, uang seharusnya saat tutup tidak berubah", async () => {
  const nanti = receiptInput({
    id: "nota-r23",
    payment: {
      timing: "nanti",
      method: null,
      cashSource: null,
      dueDate: "2026-11-16",
    },
  });
  expect((await post("/api/staff/receipts", nanti)).status).toBe(201);
  expect(cashOuts()).toEqual([]);

  vi.setSystemTime(NOW + 60_000);
  const paid = await post("/api/owner/supplier-debts/nota-r23/pay", {
    method: "tunai",
    cashSource: "laci",
  });
  expect(paid.status).toBe(200);
  expect(cashOuts()).toEqual([["lunas", TOTAL]]);

  vi.setSystemTime(NOW + 120_000);
  expect((await post("/api/owner/receipts/nota-r23/cancel", {})).status).toBe(
    200,
  );
  expect(cashOuts()).toEqual([
    ["lunas", TOTAL],
    ["koreksi", -TOTAL],
  ]);
  const batal = mockDb
    .get()
    .receiptAudit.find(
      (a) => a.receiptId === "nota-r23" && a.action === "batal",
    );
  // Koreksi tercatat di shift yang buka: tanpa catatan "Koreksi laci tidak dicatat".
  expect(batal?.changes).toEqual([]);

  const close = await post("/api/shifts/current/close", {
    countedCash: OPENING,
  });
  expect(close.status).toBe(200);
  expect(await json<ShiftClosure>(close)).toMatchObject({
    openingCash: OPENING,
    supplierPayments: 0,
    expectedCash: OPENING,
    difference: 0,
  });
});
