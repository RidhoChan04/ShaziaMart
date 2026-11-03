import { beforeEach, describe, expect, test, vi } from "vitest";
import type {
  OwnerReceipt,
  OwnerReceiptRow,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { mockDb } from "../db";
import {
  get,
  json,
  loginWithShift,
  ownerLogin,
  post,
  put,
  receiptInput,
  staffLogin,
} from "./test-helpers";

const BASE = "/api/owner/receipts";
const NOW = Date.UTC(2026, 10, 3, 3); // 3 Nov 2026 10.00 WIB

const cancel = (id = "draf-1") => post(`${BASE}/${id}/cancel`, {});
const stockOf = (name: string) => {
  const s = mockDb.get();
  const p = s.products.find((x) => x.name === name);
  if (!p) throw new Error(`seed tanpa ${name}`);
  return s.stock[p.id];
};

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  await loginWithShift(1_500_000);
  expect((await staffLogin()).status).toBe(200);
  expect((await post("/api/staff/receipts", receiptInput())).status).toBe(201);
  expect((await ownerLogin()).status).toBe(200);
});

describe("nota barang masuk di app pemilik", () => {
  test("daftar pemilik terbaru dulu (semua staf); detail memuat audit [buat, ubah, batal] terlama dulu dan paid null", async () => {
    vi.setSystemTime(NOW + 1000);
    await post("/api/staff/logout", {});
    expect((await staffLogin("Budi", "654321")).status).toBe(200);
    const nanti = receiptInput({
      id: "draf-b",
      supplierName: "Toko Grosir Makmur",
      payment: {
        timing: "nanti",
        method: null,
        cashSource: null,
        dueDate: "2026-11-16",
      },
    });
    expect((await post("/api/staff/receipts", nanti)).status).toBe(201);

    const rows = await json<OwnerReceiptRow[]>(await get(BASE));
    expect(rows.map((r) => r.id)).toEqual(["draf-b", "draf-1"]);
    expect(rows[0]).toEqual({
      id: "draf-b",
      supplierName: "Toko Grosir Makmur",
      notaDate: "2026-11-02",
      total: 1_442_000,
      lineCount: 3,
      status: "aktif",
      payment: nanti.payment,
      paid: null,
      createdAt: NOW + 1000,
      createdByName: "Budi",
      editedByName: null,
    });

    // Rina mengubah nota, pemilik membatalkan.
    await post("/api/staff/logout", {});
    await staffLogin();
    vi.setSystemTime(NOW + 2000);
    const editBody = {
      supplierName: "CV Sumber Rejeki",
      notaDate: "2026-11-02",
      lines: receiptInput().lines.map((l) => ({
        lineId: l.lineId,
        qty: l.lineId === "l1" ? 1 : l.qty,
        unitCost: l.unitCost,
        expiryDate: l.expiryDate,
      })),
      payment: receiptInput().payment,
    };
    expect((await put("/api/staff/receipts/draf-1", editBody)).status).toBe(
      200,
    );
    vi.setSystemTime(NOW + 3000);
    expect((await cancel()).status).toBe(200);

    const res = await get(`${BASE}/draf-1`);
    expect(res.status).toBe(200);
    const detail = await json<OwnerReceipt>(res);
    expect(detail).toMatchObject({
      id: "draf-1",
      supplierName: "CV Sumber Rejeki",
      total: 1_330_000,
      status: "dibatalkan",
      paymentEditable: false,
      paid: null,
      cancelledAt: NOW + 3000,
      editedAt: NOW + 2000,
      editedByName: "Rina",
    });
    expect(detail.audit).toEqual([
      {
        id: expect.any(String),
        at: NOW,
        actorName: "Rina",
        action: "buat",
        changes: [],
      },
      {
        id: expect.any(String),
        at: NOW + 2000,
        actorName: "Rina",
        action: "ubah",
        changes: ["Indomie Goreng: jumlah 2 dus → 1 dus"],
      },
      {
        id: expect.any(String),
        at: NOW + 3000,
        actorName: "Pak Ahmad",
        action: "batal",
        changes: [],
      },
    ]);
    const after = await json<OwnerReceiptRow[]>(await get(BASE));
    expect(after.find((r) => r.id === "draf-1")).toMatchObject({
      status: "dibatalkan",
      editedByName: "Rina",
      total: 1_330_000,
    });
    expect((await get(`${BASE}/tidak-ada`)).status).toBe(404);
  });

  test("batalkan → 200 OwnerReceipt dibatalkan; batal kedua → 200, tanpa mutasi/audit/cashOut tambahan", async () => {
    const stockBefore = stockOf("Indomie Goreng") ?? 0;
    const first = await cancel();
    expect(first.status).toBe(200);
    expect(await json<OwnerReceipt>(first)).toMatchObject({
      status: "dibatalkan",
      cancelledAt: NOW,
    });
    expect(stockOf("Indomie Goreng")).toBe(stockBefore - 80);
    const s = mockDb.get();
    expect(s.shift?.cashOuts.map((c) => [c.kind, c.amount])).toEqual([
      ["bayar", 1_442_000],
      ["koreksi", -1_442_000],
    ]);
    const { ownerSession: _a, ...before } = s;

    vi.setSystemTime(NOW + 60_000);
    const second = await cancel();
    expect(second.status).toBe(200);
    expect(await json<OwnerReceipt>(second)).toMatchObject({
      status: "dibatalkan",
      cancelledAt: NOW,
    });
    const { ownerSession: _b, ...after } = mockDb.get();
    expect(after).toEqual(before);
    expect((await cancel("tidak-ada")).status).toBe(404);
  });

  test("sesi staf tidak berlaku di /api/owner/receipts (401)", async () => {
    await post("/api/owner/logout", {});
    expect(mockDb.get().staffSession).not.toBeNull();
    expect((await get(BASE)).status).toBe(401);
    expect((await get(`${BASE}/draf-1`)).status).toBe(401);
    expect((await cancel()).status).toBe(401);
    expect(mockDb.get().receipts[0]?.status).toBe("aktif");
  });
});
