import { afterEach, describe, expect, test, vi } from "vitest";
import type { Session } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { mockDb } from "../db";
import { setScenario } from "../scenarios";
import { login, post } from "./test-helpers";

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
    expect(state.closedShifts).toHaveLength(1);
  });

  test("tutup shift tanpa shift -> 409 SHIFT_CLOSED", async () => {
    await login("123456");
    const res = await post("/api/shifts/current/close", { countedCash: 0 });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("SHIFT_CLOSED");
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
