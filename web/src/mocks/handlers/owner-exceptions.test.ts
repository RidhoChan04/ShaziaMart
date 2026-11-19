import { beforeEach, describe, expect, test, vi } from "vitest";
import type {
  OwnerExceptionList,
  OwnerTodaySummary,
  Problem,
  Sale,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { DAY_MS, HOUR_MS } from "@/shared/lib/business-day";
import { reviewSeedSamples } from "../attention-fixtures";
import { type MockClosedShift, mockDb } from "../db";
import {
  cashSale,
  customerId,
  get,
  json,
  loginWithShift,
  ownerLogin,
  post,
  userId,
  voidSale,
} from "./test-helpers";

/** Kamis 5 Nov 2026 10.00 WIB. */
const NOW = Date.UTC(2026, 10, 5, 3);
const MIN = 60_000;

const list = (kind: string) => get(`/api/owner/exceptions?kind=${kind}`);
const review = (body: unknown) => post("/api/owner/exceptions/review", body);
const attention = async () =>
  (await json<OwnerTodaySummary>(await get("/api/owner/summary/today")))
    .attention.exceptions;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  // (K20) Contoh seed F3c-2a sudah ditinjau: tes di sini hanya melihat butir buatannya.
  mockDb.update((s) => reviewSeedSamples(s, NOW));
});

describe("listOwnerExceptions & reviewOwnerExceptions (ruling R9)", () => {
  test("batal kasir masuk daftar & Beranda; tinjau dengan upTo; kejadian sesudah upTo tetap muncul", async () => {
    await loginWithShift();
    const first = await json<Sale>(await post("/api/sales", cashSale()));
    const second = await json<Sale>(await post("/api/sales", cashSale(2)));
    await ownerLogin();
    expect(await attention()).toEqual([]);
    vi.setSystemTime(NOW + MIN);
    await voidSale(first.id, { reason: "salah scan" });
    vi.setSystemTime(NOW + 2 * MIN);

    const res = await list("batal_transaksi");
    expect(res.status).toBe(200);
    const body = await json<OwnerExceptionList>(res);
    expect(body).toEqual({
      kind: "batal_transaksi",
      reviewedAt: null,
      items: [
        {
          id: first.id,
          kind: "batal_transaksi",
          at: NOW + MIN,
          kasirId: expect.any(String),
          kasirName: "Rina",
          amount: 36_000,
          reason: "salah scan",
          customerName: null,
          saleId: first.id,
          saleNumber: first.number,
          paymentId: null,
          shiftId: null,
          durationMinutes: null,
          fromClosedShift: false,
          refund: 0,
          qrisToOwner: 0,
          overLimitExcess: null,
        },
      ],
    });
    expect(await attention()).toEqual([
      {
        kind: "batal_transaksi",
        count: 1,
        total: 36_000,
        shortage: 0,
        from: "2026-11-05",
        to: "2026-11-05",
        latestAt: NOW + MIN,
        kasirId: null,
        kasirName: null,
        longestMinutes: null,
      },
    ]);

    // Kasir membatalkan lagi setelah daftar dimuat; pemilik menandai sampai kejadian yang dilihatnya.
    vi.setSystemTime(NOW + 3 * MIN);
    await voidSale(second.id, { reason: "pelanggan batal" });
    const reviewed = await review({
      kind: "batal_transaksi",
      upTo: body.items[0]?.at,
    });
    expect(reviewed.status).toBe(200);
    const after = await json<OwnerExceptionList>(reviewed);
    expect(after.reviewedAt).toBe(NOW + MIN);
    expect(after.items.map((e) => e.saleId)).toEqual([second.id]);
    expect(await attention()).toMatchObject([
      { kind: "batal_transaksi", count: 1, total: 72_000 },
    ]);
  });

  test("kasbon lewat limit muncul di jenisnya; jenis lain kosong", async () => {
    await loginWithShift();
    await post("/api/sales", {
      ...cashSale(),
      payments: [{ method: "credit", amount: 36_000 }],
      customerId: customerId("Pak Joko"),
      creditLimitReason: "hajatan",
    });
    await ownerLogin();
    const over = await json<OwnerExceptionList>(
      await list("kasbon_lewat_limit"),
    );
    expect(over.items).toMatchObject([
      {
        kind: "kasbon_lewat_limit",
        kasirName: "Rina",
        amount: 26_000,
        reason: "hajatan",
        customerName: "Pak Joko",
      },
    ]);
    const cancelled = await json<OwnerExceptionList>(
      await list("batal_pelunasan"),
    );
    expect(cancelled).toEqual({
      kind: "batal_pelunasan",
      reviewedAt: null,
      items: [],
    });
  });

  test("kind tidak dikenal → 422; tanpa sesi pemilik → 401; review tanpa upTo → 422; upTo masa depan dijepit ke jam server", async () => {
    expect((await list("batal_transaksi")).status).toBe(401);
    expect((await review({ kind: "batal_transaksi", upTo: NOW })).status).toBe(
      401,
    );
    await ownerLogin();
    for (const kind of ["", "lain"]) {
      const res = await list(kind);
      expect(res.status).toBe(422);
      expect((await json<Problem>(res)).code).toBe("VALIDATION");
    }
    expect((await get("/api/owner/exceptions")).status).toBe(422);
    expect((await review({ kind: "lain", upTo: NOW })).status).toBe(422);
    expect((await review({ kind: "batal_transaksi" })).status).toBe(422);
    const res = await review({ kind: "batal_pelunasan", upTo: NOW + 99 * MIN });
    expect((await json<OwnerExceptionList>(res)).reviewedAt).toBe(NOW);
  });
});

describe("(T4, K18) selisih_kecil per kasir lewat endpoint", () => {
  /** Shift tutup kasir `name` dengan selisih −4.000, `back` hari lalu. */
  const smallShort = (name: string, back: number): MockClosedShift => ({
    shiftId: `sk-${name}-${back}`,
    kasirId: userId(name),
    kasirName: name,
    openedAt: NOW - back * DAY_MS - 9 * HOUR_MS,
    closedAt: NOW - back * DAY_MS - HOUR_MS,
    openingCash: 200_000,
    suggestedOpening: null,
    openingNote: null,
    cashSales: 0,
    supplierPayments: 0,
    creditPayments: 0,
    saleRefunds: 0,
    expenses: 0,
    ownerTakes: 0,
    expectedCash: 200_000,
    countedCash: 196_000,
    difference: -4_000,
    salesCount: 0,
  });

  test("kasirId wajib untuk selisih_kecil (list & review → 422, juga kasir tak dikenal); review hanya memajukan penanda kasir itu; jenis lain mengabaikan kasirId", async () => {
    const rina = userId("Rina");
    const budi = userId("Budi");
    mockDb.update((s) => {
      s.closedShifts = [0, 1, 2, 3, 4, 5].flatMap((back) => [
        smallShort("Rina", back),
        smallShort("Budi", back),
      ]);
      s.smallShortageReviews = {};
    });
    await ownerLogin();
    const small = async () =>
      (await attention()).filter((a) => a.kind === "selisih_kecil");
    expect((await small()).map((a) => a.kasirName)).toEqual(["Budi", "Rina"]);

    for (const query of ["", "&kasirId=", "&kasirId=u-tidak-ada"]) {
      const res = await get(`/api/owner/exceptions?kind=selisih_kecil${query}`);
      expect(res.status).toBe(422);
      expect((await json<Problem>(res)).code).toBe("VALIDATION");
    }
    for (const kasirId of [undefined, null, "", "u-tidak-ada"]) {
      const res = await review({ kind: "selisih_kecil", upTo: NOW, kasirId });
      expect(res.status).toBe(422);
    }

    const listed = await json<OwnerExceptionList>(
      await get(`/api/owner/exceptions?kind=selisih_kecil&kasirId=${rina}`),
    );
    expect(listed.reviewedAt).toBeNull();
    expect(listed.items).toHaveLength(6);
    expect(new Set(listed.items.map((e) => e.kasirId))).toEqual(
      new Set([rina]),
    );

    const res = await review({
      kind: "selisih_kecil",
      upTo: listed.items[0]?.at,
      kasirId: rina,
    });
    expect(res.status).toBe(200);
    expect(await json<OwnerExceptionList>(res)).toEqual({
      kind: "selisih_kecil",
      reviewedAt: NOW - HOUR_MS,
      items: [],
    });
    expect(mockDb.get().smallShortageReviews).toEqual({
      [rina]: NOW - HOUR_MS,
    });
    expect(await small()).toMatchObject([
      { kasirId: budi, kasirName: "Budi", count: 6, total: -24_000 },
    ]);
    const others = await json<OwnerExceptionList>(
      await get(`/api/owner/exceptions?kind=selisih_kecil&kasirId=${budi}`),
    );
    expect([others.reviewedAt, others.items.length]).toEqual([null, 6]);

    // Jenis lain: kasirId diabaikan (boleh ada, boleh tidak dikenal).
    const other = await review({
      kind: "batal_pelunasan",
      upTo: NOW,
      kasirId: "u-tidak-ada",
    });
    expect(other.status).toBe(200);
    expect(
      (
        await get(
          "/api/owner/exceptions?kind=batal_pelunasan&kasirId=u-tidak-ada",
        )
      ).status,
    ).toBe(200);
  });
});
