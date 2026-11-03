import { beforeEach, describe, expect, test, vi } from "vitest";
import type {
  OwnerTodaySummary,
  ReceiptInput,
  ReceiptLineInput,
  ReceiptPayment,
  SupplierDebt,
  SupplierDebtList,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { mockDb } from "../db";
import {
  BIMOLI,
  get,
  json,
  loginWithShift,
  ownerLogin,
  post,
  receiptInput,
  staffLogin,
  unitOf,
} from "./test-helpers";

const NOW = Date.UTC(2026, 10, 2, 3); // 2 Nov 2026 10.00 WIB
const LIST = "/api/owner/supplier-debts";
const pay = (id: string, body: unknown) => post(`${LIST}/${id}/pay`, body);
const codeOf = async (res: Response) =>
  (await json<{ code: string }>(res)).code;

const nanti = (dueDate: string): ReceiptPayment => ({
  timing: "nanti",
  method: null,
  cashSource: null,
  dueDate,
});

function line(
  name: string,
  unitName: string,
  qty: number,
  unitCost: number,
): ReceiptLineInput {
  const unit = unitOf(name, unitName);
  return {
    lineId: "l1",
    productId: unit.productId,
    unitId: unit.id,
    newProduct: null,
    qty,
    unitCost,
    expiryDate: null,
  };
}

async function receive(input: ReceiptInput): Promise<void> {
  const res = await post("/api/staff/receipts", input);
  expect(res.status).toBe(201);
}

/**
 * Tiga nota Bayar nanti (Rina lewat HP): Toko Grosir Makmur 20 Okt Rp1.275.000 jt 30 Okt (`nota-a`),
 * Toko Grosir Makmur 28 Okt Rp1.370.000 jt 11 Nov (`nota-b`), CV Sumber Rejeki 2 Nov Rp1.442.000
 * jt 16 Nov (`nota-c`, baris Gula `l3` 50 kg × 16.200); plus satu nota Bayar sekarang transfer.
 */
async function seedDebts(): Promise<void> {
  await receive(
    receiptInput({
      id: "nota-a",
      supplierName: "Toko Grosir Makmur",
      notaDate: "2026-10-20",
      lines: [line("Gula Pasir", "kg", 50, 25_500)],
      payment: nanti("2026-10-30"),
    }),
  );
  await receive(
    receiptInput({
      id: "nota-b",
      supplierName: "Toko Grosir Makmur",
      notaDate: "2026-10-28",
      lines: [line(BIMOLI, "pcs", 40, 34_250)],
      payment: nanti("2026-11-11"),
    }),
  );
  await receive(receiptInput({ id: "nota-c", payment: nanti("2026-11-16") }));
  await receive(
    receiptInput({
      id: "tunai-1",
      payment: {
        timing: "sekarang",
        method: "transfer",
        cashSource: null,
        dueDate: null,
      },
    }),
  );
}

const list = async () => {
  const res = await get(LIST);
  expect(res.status).toBe(200);
  return json<SupplierDebtList>(res);
};
const debtAttention = async () =>
  (await json<OwnerTodaySummary>(await get("/api/owner/summary/today")))
    .attention.supplierDebts;
const receiptOf = (id: string) => {
  const r = mockDb.get().receipts.find((x) => x.id === id);
  if (!r) throw new Error(`tanpa nota ${id}`);
  return r;
};

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  expect((await staffLogin()).status).toBe(200);
  expect((await ownerLogin()).status).toBe(200);
});

describe("utang supplier", () => {
  test("supplier-debts: 3 utang belum lunas urut jatuh tempo; jumlah 4087000; drawerShift null tanpa shift", async () => {
    await seedDebts();
    const { debts, drawerShift } = await list();
    expect(debts.map((d) => d.receiptId)).toEqual([
      "nota-a",
      "nota-b",
      "nota-c",
    ]);
    expect(debts.reduce((sum, d) => sum + d.amount, 0)).toBe(4_087_000);
    expect(debts[0]).toEqual({
      receiptId: "nota-a",
      supplierName: "Toko Grosir Makmur",
      notaDate: "2026-10-20",
      amount: 1_275_000,
      dueDate: "2026-10-30",
      paid: null,
      photoId: null,
      createdAt: NOW,
      createdByName: "Rina",
    });
    expect(drawerShift).toBeNull();
  });

  test("attention.supplierDebts = {overdueCount:1, overdueTotal:1275000, dueSoonCount:0, dueSoonTotal:0}", async () => {
    await seedDebts();
    expect(await debtAttention()).toEqual({
      overdueCount: 1,
      overdueTotal: 1_275_000,
      dueSoonCount: 0,
      dueSoonTotal: 0,
    });
  });

  test.each([
    ["2026-11-05", 1],
    ["2026-11-02", 1],
    ["2026-11-06", 0],
  ])("utang jatuh tempo %s → dueSoonCount %i", async (dueDate, count) => {
    await receive(receiptInput({ id: "nota-x", payment: nanti(dueDate) }));
    expect(await debtAttention()).toEqual({
      overdueCount: 0,
      overdueTotal: 0,
      dueSoonCount: count,
      dueSoonTotal: count * 1_442_000,
    });
  });

  test("lunas transfer → paid {method:'transfer', cashSource:null, byName:'Pak Ahmad'}; keluar dari hitungan perhatian; bayar lagi → 409 DEBT_ALREADY_PAID", async () => {
    await seedDebts();
    const res = await pay("nota-a", { method: "transfer", cashSource: null });
    expect(res.status).toBe(200);
    const paidDebt = await json<SupplierDebt>(res);
    expect(paidDebt).toMatchObject({
      receiptId: "nota-a",
      amount: 1_275_000,
      paid: {
        at: NOW,
        method: "transfer",
        cashSource: null,
        byName: "Pak Ahmad",
      },
    });
    expect((await debtAttention()).overdueCount).toBe(0);
    // Belum lunas dulu (urut jatuh tempo), lalu yang lunas.
    expect((await list()).debts.map((d) => d.receiptId)).toEqual([
      "nota-b",
      "nota-c",
      "nota-a",
    ]);

    const again = await pay("nota-a", { method: "transfer", cashSource: null });
    expect(again.status).toBe(409);
    expect(await codeOf(again)).toBe("DEBT_ALREADY_PAID");
    expect(receiptOf("nota-a").paid?.at).toBe(NOW);
  });

  test("lunas tunai laci tanpa shift → 409 SHIFT_CLOSED; dengan shift Rina → cashOuts [{amount:1275000, kind:'lunas'}], drawerShift {kasirName:'Rina'}", async () => {
    await seedDebts();
    const before = mockDb.get();
    const closed = await pay("nota-a", { method: "tunai", cashSource: "laci" });
    expect(closed.status).toBe(409);
    expect(await codeOf(closed)).toBe("SHIFT_CLOSED");
    expect(mockDb.get().receipts).toEqual(before.receipts);
    expect(mockDb.get().receiptAudit).toEqual(before.receiptAudit);

    await loginWithShift(1_500_000);
    expect((await list()).drawerShift).toEqual({
      kasirName: "Rina",
      openedAt: NOW,
    });
    const res = await pay("nota-a", { method: "tunai", cashSource: "laci" });
    expect(res.status).toBe(200);
    expect(mockDb.get().shift?.cashOuts).toEqual([
      {
        id: expect.any(String),
        at: NOW,
        amount: 1_275_000,
        receiptId: "nota-a",
        kind: "lunas",
      },
    ]);
    expect(receiptOf("nota-a").paid).toEqual({
      at: NOW,
      method: "tunai",
      cashSource: "laci",
      byName: "Pak Ahmad",
    });
  });

  test("tunai uang pemilik saat shift buka → lunas tanpa uang keluar laci", async () => {
    await seedDebts();
    await loginWithShift(1_500_000);
    const res = await pay("nota-b", { method: "tunai", cashSource: "pemilik" });
    expect(res.status).toBe(200);
    expect(mockDb.get().shift?.cashOuts).toEqual([]);
    expect(receiptOf("nota-b").paid?.cashSource).toBe("pemilik");
  });

  test("tunai tanpa cashSource → 422; nota dibatalkan (status diubah di state) → 409 RECEIPT_CANCELLED", async () => {
    await seedDebts();
    const before = mockDb.get();
    for (const body of [
      { method: "tunai", cashSource: null },
      { method: "transfer", cashSource: "pemilik" },
      { method: "cek", cashSource: null },
      { method: "tunai" },
      null,
    ]) {
      const res = await pay("nota-a", body);
      expect(res.status).toBe(422);
      expect(await codeOf(res)).toBe("VALIDATION");
    }
    for (const id of ["tidak-ada", "tunai-1"]) {
      const res = await pay(id, { method: "transfer", cashSource: null });
      expect(res.status).toBe(404);
    }
    expect(mockDb.get().receipts).toEqual(before.receipts);

    mockDb.update((s) => {
      const r = s.receipts.find((x) => x.id === "nota-b");
      if (r) r.status = "dibatalkan";
    });
    const res = await pay("nota-b", { method: "transfer", cashSource: null });
    expect(res.status).toBe(409);
    expect(await codeOf(res)).toBe("RECEIPT_CANCELLED");
    expect((await list()).debts.map((d) => d.receiptId)).toEqual([
      "nota-a",
      "nota-c",
    ]);
  });

  test("amount utang diturunkan: qty baris Gula di state diubah 50 → 48 → amount 1409600; audit lunas changes ['Transfer']", async () => {
    await seedDebts();
    mockDb.update((s) => {
      const gula = s.receipts
        .find((r) => r.id === "nota-c")
        ?.lines.find((l) => l.lineId === "l3");
      if (gula) gula.qty = 48;
    });
    const debt = (await list()).debts.find((d) => d.receiptId === "nota-c");
    expect(debt?.amount).toBe(1_409_600);

    const res = await pay("nota-c", { method: "transfer", cashSource: null });
    expect((await json<SupplierDebt>(res)).amount).toBe(1_409_600);
    const audit = mockDb
      .get()
      .receiptAudit.filter((a) => a.receiptId === "nota-c");
    expect(audit.map((a) => a.action)).toEqual(["buat", "lunas"]);
    expect(audit[1]).toMatchObject({
      at: NOW,
      actorName: "Pak Ahmad",
      action: "lunas",
      changes: ["Transfer"],
    });
  });

  test("tanpa sesi pemilik → 401 (sesi orang toko tidak berlaku)", async () => {
    await seedDebts();
    await post("/api/owner/logout", {});
    expect((await get(LIST)).status).toBe(401);
    const res = await pay("nota-a", { method: "transfer", cashSource: null });
    expect(res.status).toBe(401);
    expect(receiptOf("nota-a").paid).toBeNull();
  });
});
