import { afterEach, describe, expect, test, vi } from "vitest";
import type { Session } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { newId } from "@/shared/lib/id";
import { mockDb } from "../db";
import { setScenario } from "../scenarios";
import {
  BIMOLI,
  login,
  loginWithShift,
  placedShifts,
  post,
  receiptInput,
  saleItem,
  staffLogin,
} from "./test-helpers";

afterEach(() => {
  vi.useRealTimers();
});

describe("auth", () => {
  test("login PIN benar membuat sesi", async () => {
    const res = await login("123456");
    expect(res.status).toBe(200);
    expect(((await res.json()) as Session).user.name).toBe("Rina");
    expect((await fetch("/api/auth/session")).status).toBe(200);
  });

  test("tanpa sesi -> 401 UNAUTHORIZED; logout menghapus sesi", async () => {
    const res = await fetch("/api/auth/session");
    expect(res.status).toBe(401);
    expect(res.headers.get("Content-Type")).toContain("problem+json");
    expect(((await res.json()) as { code: string }).code).toBe("UNAUTHORIZED");
    await login("123456");
    expect((await post("/api/auth/logout", {})).status).toBe(204);
    expect((await fetch("/api/auth/session")).status).toBe(401);
  });

  test("userId tak dikenal -> 401 PIN_INVALID; body salah -> 422", async () => {
    const res = await post("/api/auth/pin-login", {
      userId: "x",
      pin: "123456",
    });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { code: string }).code).toBe("PIN_INVALID");
    expect((await login("12")).status).toBe(422);
  });

  test("5x PIN salah -> 423, PIN benar tetap ditolak sampai 5 menit lewat", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_700_000_000_000);
    for (let i = 0; i < 4; i++) {
      const res = await login("000000");
      expect(res.status).toBe(401);
      expect(((await res.json()) as { code: string }).code).toBe("PIN_INVALID");
    }
    const fifth = await login("000000");
    expect(fifth.status).toBe(423);
    const locked = await login("123456");
    expect(locked.status).toBe(423);
    const body = (await locked.json()) as { code: string; detail: string };
    expect(body.code).toBe("LOCKED_OUT");
    expect(body.detail).toBe("Coba lagi dalam 5 menit");
    vi.setSystemTime(1_700_000_000_000 + 300_000);
    expect((await login("123456")).status).toBe(200);
  });

  test("login sukses mereset hitungan gagal", async () => {
    for (let i = 0; i < 4; i++)
      expect((await login("000000")).status).toBe(401);
    expect((await login("123456")).status).toBe(200);
    for (let i = 0; i < 4; i++)
      expect((await login("000000")).status).toBe(401);
    expect((await login("000000")).status).toBe(423);
  });

  test("setelah kunci kedaluwarsa hitungan gagal mulai dari nol", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_700_000_000_000);
    for (let i = 0; i < 5; i++) await login("000000");
    vi.setSystemTime(1_700_000_000_000 + 300_000);
    const first = await login("000000");
    expect(first.status).toBe(401);
    expect(((await first.json()) as { code: string }).code).toBe("PIN_INVALID");
    for (let i = 0; i < 3; i++)
      expect((await login("000000")).status).toBe(401);
    expect((await login("000000")).status).toBe(423);
  });
});

describe("shift", () => {
  test("shift saat ini terbaca tanpa sesi (layar kunci butuh kasir shift)", async () => {
    await login("123456");
    await post("/api/shifts", { openingCash: 0 });
    await post("/api/auth/logout", {});
    const res = await fetch("/api/shifts/current");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { shift: unknown }).shift).toMatchObject({
      kasirName: "Rina",
    });
  });

  test("buka shift tanpa sesi -> 401; dua kali -> 409 SHIFT_ALREADY_OPEN", async () => {
    expect((await post("/api/shifts", { openingCash: 1000 })).status).toBe(401);
    await login("123456");
    const res = await post("/api/shifts", { openingCash: 200_000 });
    expect(res.status).toBe(201);
    const shift = (await res.json()) as {
      kasirName: string;
      openingCash: number;
    };
    expect(shift.kasirName).toBe("Rina");
    const again = await post("/api/shifts", { openingCash: 1000 });
    expect(again.status).toBe(409);
    expect(((await again.json()) as { code: string }).code).toBe(
      "SHIFT_ALREADY_OPEN",
    );
    const current = await fetch("/api/shifts/current");
    expect(((await current.json()) as { shift: unknown }).shift).toMatchObject({
      openingCash: 200_000,
    });
  });

  test("modal awal tidak valid -> 422", async () => {
    await login("123456");
    expect((await post("/api/shifts", { openingCash: -1 })).status).toBe(422);
    expect((await post("/api/shifts", { openingCash: 1.5 })).status).toBe(422);
    expect((await post("/api/shifts", {})).status).toBe(422);
  });

  test("tutup shift menghitung selisih", async () => {
    await login("123456");
    await post("/api/shifts", { openingCash: 200_000 });
    mockDb.update((s) => {
      if (s.shift) s.shift.cashSales = 150_000;
    });
    const res = await post("/api/shifts/current/close", {
      countedCash: 345_000,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      openingCash: 200_000,
      cashSales: 150_000,
      expectedCash: 350_000,
      countedCash: 345_000,
      difference: -5000,
    });
    const state = mockDb.get();
    expect(state.shift).toBeNull();
    expect(state.session).toBeNull();
    expect(placedShifts(state)).toHaveLength(1);
  });

  test("tutup shift tanpa shift -> 409 SHIFT_CLOSED", async () => {
    await login("123456");
    const res = await post("/api/shifts/current/close", { countedCash: 0 });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("SHIFT_CLOSED");
  });
});

describe("tutup shift dengan Bayar supplier", () => {
  const NOW = Date.UTC(2026, 10, 2, 3); // 2 Nov 2026 10.00 WIB
  const close = (countedCash: number) =>
    post("/api/shifts/current/close", { countedCash });
  /** Penjualan tunai pas Rp150.000: Beras Pandan Wangi 78.000 + Bimoli 2 × 36.000. */
  const cashSales150k = () =>
    post("/api/sales", {
      saleId: newId(),
      items: [
        saleItem("Beras Pandan Wangi 5 kg", { qtyBase: 1 }, 78_000),
        saleItem(BIMOLI, { qtyBase: 2 }, 36_000),
      ],
      payments: [{ method: "cash", amount: 150_000 }],
      cashReceived: 150_000,
      print: false,
    });

  test("tutup shift: modal 1.500.000 + tunai 150.000 − Bayar supplier 1.442.000, uang fisik 203.000 → {supplierPayments:1442000, expectedCash:208000, difference:-5000}", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    await loginWithShift(1_500_000);
    expect((await staffLogin()).status).toBe(200);
    // Nota mockup dibayar sekarang, tunai, dari laci kasir.
    expect((await post("/api/staff/receipts", receiptInput())).status).toBe(
      201,
    );
    expect((await cashSales150k()).status).toBe(201);

    const res = await close(203_000);
    expect(res.status).toBe(200);
    const closure = {
      openingCash: 1_500_000,
      cashSales: 150_000,
      supplierPayments: 1_442_000,
      expectedCash: 208_000,
      countedCash: 203_000,
      difference: -5000,
      salesCount: 1,
    };
    expect(await res.json()).toEqual({
      shiftId: expect.any(String),
      ...closure,
    });
    expect(placedShifts()).toEqual([
      expect.objectContaining({ ...closure, kasirName: "Rina", closedAt: NOW }),
    ]);
  });

  test("tutup shift tanpa uang keluar → supplierPayments 0, expectedCash = modal + tunai (perilaku lama)", async () => {
    await loginWithShift(1_500_000);
    expect((await cashSales150k()).status).toBe(201);
    const res = await close(1_650_000);
    expect(await res.json()).toMatchObject({
      supplierPayments: 0,
      expectedCash: 1_650_000,
      difference: 0,
    });
  });

  test("buka shift baru → cashOuts kosong (uang keluar shift lama tidak terbawa)", async () => {
    await loginWithShift(1_500_000);
    mockDb.update((s) => {
      s.shift?.cashOuts.push({
        id: "c1",
        at: 1,
        amount: 50_000,
        receiptId: "r1",
        kind: "bayar",
      });
    });
    await close(0);
    await loginWithShift(100_000);
    expect(mockDb.get().shift?.cashOuts).toEqual([]);
  });
});

describe("skenario server-mati", () => {
  test("semua endpoint gagal jaringan", async () => {
    setScenario("server-mati");
    const calls = [
      fetch("/api/users/kasir"),
      post("/api/auth/pin-login", { userId: "x", pin: "123456" }),
      fetch("/api/auth/session"),
      post("/api/auth/logout", {}),
      fetch("/api/shifts/current"),
      post("/api/shifts", { openingCash: 0 }),
      post("/api/shifts/current/close", { countedCash: 0 }),
      fetch("/api/settings/kasir"),
      fetch("/api/catalog/lookup?code=1001"),
      fetch("/api/catalog/search?q=indo"),
      fetch("/api/catalog/quick-curah"),
    ];
    for (const call of calls) await expect(call).rejects.toThrow();
  });
});
