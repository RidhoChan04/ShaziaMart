import { expect, test } from "vitest";
import type { KasirCreditPayment } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { DUPLICATE_WINDOW_MS, findRecentDuplicate } from "./duplicate-check";

const NOW = Date.UTC(2026, 10, 19, 7, 30); // 14.30 WIB

function payment(patch: Partial<KasirCreditPayment>): KasirCreditPayment {
  return {
    id: "pel-1",
    customerId: "c-sari",
    customerName: "Bu Sari",
    amount: 50_000,
    method: "tunai",
    cashReceived: 50_000,
    change: 0,
    balanceAfter: 70_000,
    createdAt: NOW - 25 * 60_000,
    kasirName: "Rina",
    shiftId: "shift-1",
    status: "aktif",
    printStatus: "tidak_dicetak",
    ...patch,
  };
}

const ask = { customerId: "c-sari", amount: 50_000, id: "pel-baru", now: NOW };

test("jendela 60 menit", () => {
  expect(DUPLICATE_WINDOW_MS).toBe(60 * 60_000);
});

test("pelanggan & nominal sama, id beda, 25 menit lalu → ketemu", () => {
  const p = payment({});
  expect(findRecentDuplicate([p], ask)).toBe(p);
});

test("tepi 60 menit: tepat 60 menit lalu ikut, 60 menit + 1 ms tidak", () => {
  const edge = payment({ createdAt: NOW - DUPLICATE_WINDOW_MS });
  expect(findRecentDuplicate([edge], ask)).toBe(edge);
  const old = payment({ createdAt: NOW - DUPLICATE_WINDOW_MS - 1 });
  expect(findRecentDuplicate([old], ask)).toBeNull();
});

test("yang dibatalkan diabaikan", () => {
  expect(
    findRecentDuplicate([payment({ status: "dibatalkan" })], ask),
  ).toBeNull();
});

test("id sama (rekaman pelunasan ini sendiri) diabaikan", () => {
  expect(findRecentDuplicate([payment({ id: "pel-baru" })], ask)).toBeNull();
});

test("pelanggan lain atau nominal lain → bukan dobel; cara bayar tidak menentukan", () => {
  expect(
    findRecentDuplicate([payment({ customerId: "c-dewi" })], ask),
  ).toBeNull();
  expect(findRecentDuplicate([payment({ amount: 50_001 })], ask)).toBeNull();
  const qris = payment({ method: "qris", cashReceived: 0 });
  expect(findRecentDuplicate([qris], ask)).toBe(qris);
});

test("beberapa yang cocok → yang terbaru, apa pun urutan daftarnya", () => {
  const a = payment({ id: "a", createdAt: NOW - 50 * 60_000 });
  const b = payment({ id: "b", createdAt: NOW - 5 * 60_000 });
  const c = payment({ id: "c", createdAt: NOW - 30 * 60_000 });
  expect(findRecentDuplicate([a, b, c], ask)).toBe(b);
  expect(findRecentDuplicate([b, c, a], ask)).toBe(b);
});

test("daftar kosong → null", () => {
  expect(findRecentDuplicate([], ask)).toBeNull();
});
