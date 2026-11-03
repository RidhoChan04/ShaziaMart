import { beforeEach, describe, expect, test, vi } from "vitest";
import type {
  ReceiptEdit,
  ReceiptError,
  StaffReceipt,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  RECEIPT_LINES_MISMATCH,
  RECEIPT_PAYMENT_LOCKED,
} from "@/shared/lib/receipt-rules";
import { mockDb } from "../db";
import {
  deepKeys,
  FORBIDDEN_STAFF_KEYS,
  json,
  loginWithShift,
  ownerLogin,
  post,
  put,
  receiptInput,
  staffLogin,
} from "./test-helpers";

const BASE = "/api/staff/receipts";
const NOW = Date.UTC(2026, 10, 3, 3); // 3 Nov 2026 10.00 WIB

/** Isi ubah nota mockup `draf-1` (tanpa perubahan bila `patch` kosong). */
function mockupEdit(
  patch: Partial<Omit<ReceiptEdit, "lines">> = {},
  qty: Partial<Record<"l1" | "l2" | "l3", number>> = {},
): ReceiptEdit {
  const input = receiptInput();
  return {
    supplierName: input.supplierName,
    notaDate: input.notaDate,
    lines: input.lines.map((l) => ({
      lineId: l.lineId,
      qty: qty[l.lineId as "l1" | "l2" | "l3"] ?? l.qty,
      unitCost: l.unitCost,
      expiryDate: l.expiryDate,
    })),
    payment: input.payment,
    ...patch,
  };
}

const edit = (body: unknown, id = "draf-1") => put(`${BASE}/${id}`, body);
const errorsOf = async (res: Response) =>
  (await json<{ errors: ReceiptError[] }>(res)).errors;
const codeOf = async (res: Response) =>
  (await json<{ code: string }>(res)).code;

const dataOf = () => {
  const {
    staffSession: _a,
    session: _b,
    ownerSession: _c,
    ...rest
  } = mockDb.get();
  return rest;
};

async function switchStaff(name: string, pin: string): Promise<void> {
  await post("/api/staff/logout", {});
  expect((await staffLogin(name, pin)).status).toBe(200);
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  await loginWithShift(1_500_000);
  expect((await staffLogin()).status).toBe(200);
  expect((await post(BASE, receiptInput())).status).toBe(201);
  vi.setSystemTime(NOW + 60_000);
});

describe("PUT /api/staff/receipts/:id", () => {
  test("ubah Gula 50→48 kg → 200 StaffReceipt dengan total, editedAt/editedByName; tanpa key terlarang", async () => {
    const res = await edit(mockupEdit({}, { l3: 48 }));
    expect(res.status).toBe(200);
    const body = await json<StaffReceipt>(res);
    expect(body).toMatchObject({
      id: "draf-1",
      total: 1_409_600,
      editedAt: NOW + 60_000,
      editedByName: "Rina",
      status: "aktif",
    });
    expect(body.lines[2]).toMatchObject({ qty: 48, subtotal: 777_600 });
    const keys = deepKeys(body);
    expect(FORBIDDEN_STAFF_KEYS.filter((k) => keys.has(k))).toEqual([]);
    expect(mockDb.get().shift?.cashOuts.map((c) => c.amount)).toEqual([
      1_442_000, -32_400,
    ]);
  });

  test("lineId kurang/lebih → 422 lines 'Baris nota tidak cocok — muat ulang' tanpa perubahan", async () => {
    const before = dataOf();
    const full = mockupEdit({}, { l1: 1 });
    for (const lines of [
      full.lines.slice(0, 2),
      [...full.lines, { ...full.lines[0], lineId: "l9" }],
    ]) {
      const res = await edit({ ...full, lines });
      expect(res.status).toBe(422);
      expect(await errorsOf(res)).toEqual([
        { lineId: null, field: "lines", message: RECEIPT_LINES_MISMATCH },
      ]);
    }
    expect(dataOf()).toEqual(before);
  });

  test("ubah pembayaran nota 'sekarang' → 422 payment; atomik (baris lain tidak ikut berubah)", async () => {
    const before = dataOf();
    const res = await edit(
      mockupEdit(
        {
          payment: {
            timing: "sekarang",
            method: "transfer",
            cashSource: null,
            dueDate: null,
          },
        },
        { l1: 1 },
      ),
    );
    expect(res.status).toBe(422);
    expect(await errorsOf(res)).toEqual([
      { lineId: null, field: "payment", message: RECEIPT_PAYMENT_LOCKED },
    ]);
    expect(dataOf()).toEqual(before);
  });

  test("body rusak → 422 VALIDATION errors []", async () => {
    for (const body of [
      null,
      { ...mockupEdit(), lines: "x" },
      { ...mockupEdit(), payment: { timing: "kapan" } },
      { ...mockupEdit(), lines: [{ lineId: "l1", qty: "2" }] },
    ]) {
      const res = await edit(body);
      expect(res.status).toBe(422);
      expect(await errorsOf(res)).toEqual([]);
    }
  });

  test("Budi ubah nota Rina → 404; nota tidak ada → 404; nota dibatalkan → 409 RECEIPT_CANCELLED", async () => {
    await switchStaff("Budi", "654321");
    const before = dataOf();
    expect((await edit(mockupEdit({}, { l1: 1 }))).status).toBe(404);
    expect(dataOf()).toEqual(before);

    await switchStaff("Rina", "123456");
    expect((await edit(mockupEdit(), "tidak-ada")).status).toBe(404);
    expect((await ownerLogin()).status).toBe(200);
    expect((await post("/api/owner/receipts/draf-1/cancel", {})).status).toBe(
      200,
    );
    const res = await edit(mockupEdit({}, { l1: 1 }));
    expect(res.status).toBe(409);
    expect(await codeOf(res)).toBe("RECEIPT_CANCELLED");
  });

  test("sesi pemilik/kasir tidak berlaku di PUT /api/staff/receipts (401); lewat terowongan → 403", async () => {
    await post("/api/staff/logout", {});
    expect((await ownerLogin()).status).toBe(200);
    expect((await edit(mockupEdit({}, { l1: 1 }))).status).toBe(401);
    await staffLogin();
    const tunnel = await put(`${BASE}/draf-1`, mockupEdit(), {
      "Cf-Connecting-Ip": "1.2.3.4",
    });
    expect(tunnel.status).toBe(403);
    expect(await codeOf(tunnel)).toBe("STAFF_LAN_ONLY");
  });
});
