import { beforeEach, describe, expect, test, vi } from "vitest";
import type {
  OwnerExceptionList,
  OwnerTodaySummary,
  Problem,
  Sale,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  cashSale,
  customerId,
  get,
  json,
  loginWithShift,
  ownerLogin,
  post,
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
          kasirName: "Rina",
          amount: 36_000,
          reason: "salah scan",
          customerName: null,
          saleId: first.id,
          saleNumber: first.number,
          paymentId: null,
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
        from: "2026-11-05",
        to: "2026-11-05",
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
