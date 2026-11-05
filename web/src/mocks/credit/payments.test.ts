import { beforeEach, describe, expect, test } from "vitest";
import type { MockShift, MockState, MockUser } from "../db";
import { createSeedState } from "../seed-data";
import { cancelPayment, creditPaymentsOf, recordPayment } from "./payments";

/** Kamis 5 Nov 2026 10.00 WIB. */
const NOW = Date.UTC(2026, 10, 5, 3);

let state: MockState;
let rina: MockUser;
let owner: MockUser;
let sari: string;

const userNamed = (name: string): MockUser => {
  const u = state.users.find((x) => x.name === name);
  if (!u) throw new Error(name);
  return u;
};

function openShift(id: string): MockShift {
  const shift: MockShift = {
    id,
    kasirId: rina.id,
    kasirName: rina.name,
    openedAt: NOW - 3_600_000,
    openingCash: 200_000,
    cashSales: 0,
    salesCount: 0,
    cashOuts: [],
    creditCash: [],
    saleRefunds: [],
  };
  state.shift = shift;
  return shift;
}

const tunai = (id: string, amount: number) => ({
  id,
  customerId: sari,
  amount,
  method: "tunai",
  cashReceived: amount,
  print: false,
});

const kasirPay = (id: string, amount: number, now = NOW) =>
  recordPayment(state, rina, "kasir", sari, tunai(id, amount), now);
const kasirCancel = (id: string, now = NOW) =>
  cancelPayment(
    state,
    id,
    { user: rina, channel: "kasir" },
    { reason: "x" },
    now,
  );
const ownerCancel = (id: string, now = NOW) =>
  cancelPayment(
    state,
    id,
    { user: owner, channel: "pemilik" },
    { reason: "x" },
    now,
  );

beforeEach(() => {
  state = createSeedState(NOW);
  rina = userNamed("Rina");
  owner = userNamed("Pak Ahmad");
  sari = state.customers.find((c) => c.name === "Bu Sari")?.id ?? "";
});

describe("recordPayment", () => {
  test("jam rekaman = jam server (bukan dari body); 201 lalu replay 200", () => {
    openShift("A");
    const body = { ...tunai("p1", 10_000), at: 1, createdAt: 1 };
    const first = recordPayment(state, rina, "kasir", sari, body, NOW);
    expect(first).toMatchObject({ status: 201, payment: { at: NOW } });
    const again = recordPayment(state, rina, "kasir", sari, body, NOW + 5);
    expect(again).toMatchObject({ status: 200, payment: { at: NOW } });
    expect(state.creditPayments.filter((p) => p.id === "p1")).toHaveLength(1);
  });

  test("id sama di jalur lain oleh pembuat yang sama → 409 ID_TAKEN (tidak bisa ditampilkan sebagai rekaman jalur itu)", async () => {
    const res = recordPayment(
      state,
      owner,
      "pemilik",
      sari,
      { id: "p1", amount: 1, method: "transfer" },
      NOW,
    );
    expect(res).not.toBeInstanceOf(Response);
    openShift("A");
    const cross = recordPayment(
      state,
      owner,
      "kasir",
      sari,
      tunai("p1", 1),
      NOW,
    );
    expect(cross).toBeInstanceOf(Response);
    expect(cross instanceof Response && cross.status).toBe(409);
    expect(
      cross instanceof Response &&
        ((await cross.json()) as { code: string }).code,
    ).toBe("ID_TAKEN");
  });
});

describe("creditPaymentsOf: ShiftClosure.creditPayments tidak pernah negatif", () => {
  test("Σ creditCash; batal kasir di shift yang sama → 0, bukan negatif", () => {
    const a = openShift("A");
    kasirPay("p1", 30_000);
    kasirPay("p2", 20_000);
    expect(creditPaymentsOf(a)).toBe(50_000);
    expect(kasirCancel("p1")).not.toBeInstanceOf(Response);
    expect(creditPaymentsOf(a)).toBe(20_000);
    expect(kasirCancel("p2")).not.toBeInstanceOf(Response);
    expect(creditPaymentsOf(a)).toBe(0);
    // Batal ulang tidak menulis baris laci kedua.
    expect(kasirCancel("p2")).not.toBeInstanceOf(Response);
    expect(creditPaymentsOf(a)).toBe(0);
    expect(a.creditCash).toHaveLength(4);
  });

  test("pelunasan shift lama tidak bisa dibatalkan kasir di shift baru; batal pemilik tidak menyentuh laci shift mana pun", () => {
    openShift("A");
    kasirPay("p1", 30_000);
    const b = openShift("B");
    const outside = kasirCancel("p1");
    expect(outside instanceof Response && outside.status).toBe(409);
    expect(creditPaymentsOf(b)).toBe(0);
    expect(ownerCancel("p1")).not.toBeInstanceOf(Response);
    expect(b.creditCash).toEqual([]);
    expect(creditPaymentsOf(b)).toBe(0);
  });

  test("urutan acak pelunasan & batal kasir: Σ creditCash selalu ≥ 0 dan = Σ pelunasan tunai aktif shift ini", () => {
    const a = openShift("A");
    const amounts = [5_000, 12_000, 1_000, 7_500, 20_000];
    amounts.forEach((amount, i) => {
      kasirPay(`p${i}`, amount);
    });
    for (const i of [3, 0, 4, 1, 2]) {
      kasirCancel(`p${i}`);
      expect(creditPaymentsOf(a)).toBeGreaterThanOrEqual(0);
      const active = state.creditPayments
        .filter((p) => p.shiftId === "A" && p.cancelledAt === null)
        .reduce((sum, p) => sum + p.amount, 0);
      expect(creditPaymentsOf(a)).toBe(active);
    }
  });
});
