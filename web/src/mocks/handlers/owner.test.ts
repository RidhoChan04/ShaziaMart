import { afterEach, describe, expect, test, vi } from "vitest";
import type {
  OwnerSession,
  OwnerTodaySummary,
  Session,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { mockDb } from "../db";
import { login, post } from "./test-helpers";

afterEach(() => {
  vi.useRealTimers();
});

const ownerLogin = (name = "Pak Ahmad", password = "pemilik123") =>
  post("/api/owner/login", { name, password });
const code = async (res: Response) =>
  ((await res.json()) as { code: string }).code;
const summary = async () =>
  (await (await fetch("/api/owner/summary/today")).json()) as OwnerTodaySummary;

describe("login pemilik", () => {
  test("nama tanpa beda huruf & spasi, password persis -> sesi pemilik", async () => {
    const res = await ownerLogin("  pak AHMAD ");
    expect(res.status).toBe(200);
    expect(((await res.json()) as OwnerSession).user).toEqual({
      id: mockDb.get().users.find((u) => u.role === "pemilik")?.id,
      name: "Pak Ahmad",
      role: "pemilik",
    });
    expect((await fetch("/api/owner/session")).status).toBe(200);
  });

  test("salah nama/password/kasir -> 401 LOGIN_INVALID; body kosong -> 422", async () => {
    for (const res of [
      await ownerLogin("Pak Ahmad", "Pemilik123"),
      await ownerLogin("Rina", "123456"),
      await ownerLogin("Siapa", "x"),
    ]) {
      expect(res.status).toBe(401);
      expect(await code(res)).toBe("LOGIN_INVALID");
    }
    expect((await post("/api/owner/login", { name: "" })).status).toBe(422);
  });

  test("5x password salah -> 423; benar setelah 5 menit -> 200", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 9, 23, 3));
    for (let i = 0; i < 4; i++) {
      expect((await ownerLogin("Pak Ahmad", "salah")).status).toBe(401);
    }
    const fifth = await ownerLogin("Pak Ahmad", "salah");
    expect(fifth.status).toBe(423);
    expect(((await fifth.json()) as { detail: string }).detail).toBe(
      "Coba lagi dalam 5 menit",
    );
    expect((await ownerLogin()).status).toBe(423);
    vi.setSystemTime(Date.UTC(2026, 9, 23, 3, 5, 1));
    expect((await ownerLogin()).status).toBe(200);
    expect(mockDb.get().ownerLoginFailures).toEqual({});
  });

  test("logout menghapus sesi pemilik", async () => {
    await ownerLogin();
    expect((await post("/api/owner/logout", {})).status).toBe(204);
    expect((await fetch("/api/owner/session")).status).toBe(401);
  });
});

describe("realm terpisah", () => {
  test("login pemilik tidak mengubah sesi kasir; logout kasir tidak mengubah sesi pemilik", async () => {
    await login("123456");
    await ownerLogin();
    expect(
      ((await (await fetch("/api/auth/session")).json()) as Session).user.name,
    ).toBe("Rina");
    await post("/api/auth/logout", {});
    expect((await fetch("/api/owner/session")).status).toBe(200);
    await post("/api/owner/logout", {});
    await login("123456");
    expect((await fetch("/api/auth/session")).status).toBe(200);
  });

  test("sesi kasir saja tidak membuka endpoint pemilik; sesi pemilik saja tidak membuka kasir", async () => {
    await login("123456");
    expect((await fetch("/api/owner/summary/today")).status).toBe(401);
    await post("/api/auth/logout", {});
    await ownerLogin();
    expect((await fetch("/api/auth/session")).status).toBe(401);
  });
});

describe("ringkasan hari ini", () => {
  test("tanpa sesi pemilik -> 401 UNAUTHORIZED", async () => {
    const res = await fetch("/api/owner/summary/today");
    expect(res.status).toBe(401);
    expect(await code(res)).toBe("UNAUTHORIZED");
  });

  test("tutup shift hari ini dengan selisih -5000 -> cashDifferences memuat Rina; riwayat seed tidak menambah penjualan hari ini", async () => {
    await ownerLogin();
    const empty = await summary();
    expect([empty.revenue, empty.hourly.length]).toEqual([0, 24]);
    expect(empty.attention.cashDifferences).toEqual([]);

    await login("123456");
    await post("/api/shifts", { openingCash: 200_000 });
    await post("/api/shifts/current/close", { countedCash: 195_000 });
    const after = await summary();
    expect(after.attention.cashDifferences).toEqual([
      {
        shiftId: expect.any(String),
        kasirName: "Rina",
        closedAt: expect.any(Number),
        difference: -5_000,
      },
    ]);
    expect(after.salesCount).toBe(0);
  });
});
