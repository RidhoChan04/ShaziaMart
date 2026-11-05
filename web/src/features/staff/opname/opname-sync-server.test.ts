import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, test } from "vitest";
import { type MockProduct, mockDb } from "@/mocks/db";
import { staffOpnameHandlers } from "@/mocks/handlers/staff-opname";
import { BIMOLI } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import { toStaffProduct } from "@/mocks/products/views";
import {
  INDOMIE,
  startServerSync,
  stockOf,
  switchStaff,
  userIdOf,
} from "../drafts/sync-server-kit";
import type { OpnameDraft } from "./opname-draft-types";
import { opnameDraft, opnameStoreWith } from "./opname-fixtures";
import { realOpnameSyncApi, syncOpnameDrafts } from "./opname-sync";

const SESSIONS = "/api/staff/opname-sessions";
const MIN = 60_000;

function seedProduct(name: string): MockProduct {
  const p = mockDb.get().products.find((x) => x.name === name);
  if (!p) throw new Error(`seed tanpa ${name}`);
  return p;
}

/** Draf Rina: `name` dihitung `qtyBase`, dibuka 5 menit sebelum jam (palsu) sekarang. */
function serverOpnameDraft(
  id: string,
  name: string,
  qtyBase: number,
  patch: Partial<OpnameDraft> = {},
): OpnameDraft {
  const p = seedProduct(name);
  return opnameDraft(id, {
    userId: userIdOf("Rina"),
    scope: { kind: "semua", category: null },
    products: [toStaffProduct(p)],
    counts: { [p.id]: { qtyBase, countedAt: Date.now() - 5 * MIN } },
    ...patch,
  });
}

const stokAwalEntries = (sessionId: string) =>
  mockDb
    .get()
    .stockEntries.filter(
      (e) => e.opnameId === sessionId && e.kind === "stok_awal",
    );

describe("syncOpnameDrafts lewat server palsu (realOpnameSyncApi)", () => {
  beforeEach(async () => {
    await startServerSync();
    mockDb.update((s) => {
      for (const p of s.products) {
        if (p.name === INDOMIE) p.stockCounted = false;
      }
    });
  });

  test("antre → terkirim → draf hilang; respons hilang (server sudah menyimpan) → kirim ulang 200, stok disesuaikan sekali", async () => {
    const [realPost] = staffOpnameHandlers.filter(
      (h) => h.info.method === "POST" && h.info.path === SESSIONS,
    );
    if (!realPost) throw new Error("tanpa handler POST opname");
    let posts = 0;
    server.use(
      http.post(
        SESSIONS,
        async ({ request, requestId }) => {
          posts += 1;
          await realPost.run({ request, requestId });
          return HttpResponse.error();
        },
        { once: true },
      ),
    );
    const store = await opnameStoreWith(
      serverOpnameDraft("opname-1", INDOMIE, 37),
    );

    expect(
      await syncOpnameDrafts(store, userIdOf("Rina"), realOpnameSyncApi),
    ).toEqual({ sent: [], rejected: [], stopped: "offline" });
    expect(posts).toBe(1);
    expect(stockOf(INDOMIE)).toBe(37);
    expect((await store.get("opname-1"))?.status).toBe("queued");

    expect(
      await syncOpnameDrafts(store, userIdOf("Rina"), realOpnameSyncApi),
    ).toEqual({ sent: ["opname-1"], rejected: [], stopped: null });
    expect(await store.list()).toEqual([]);
    expect(stockOf(INDOMIE)).toBe(37);
    expect(stokAwalEntries("opname-1")).toHaveLength(1);
    expect(
      mockDb.get().opnameSessions.filter((s) => s.id === "opname-1"),
    ).toHaveLength(1);
  });

  test("jam hitung asli dipakai server (bukan jam kirim)", async () => {
    const store = await opnameStoreWith(
      serverOpnameDraft("opname-1", INDOMIE, 37),
    );
    await syncOpnameDrafts(store, userIdOf("Rina"), realOpnameSyncApi);
    const item = mockDb.get().opnameSessions.find((s) => s.id === "opname-1")
      ?.items[0];
    expect(item?.countedAt).toBe(Date.now() - 5 * MIN);
    expect(item?.clockEstimated).toBe(false);
  });

  test("422 barang nonaktif → rejected dengan errors per productId; draf lain tetap terkirim", async () => {
    mockDb.update((s) => {
      for (const p of s.products) if (p.name === BIMOLI) p.status = "nonaktif";
    });
    const store = await opnameStoreWith(
      serverOpnameDraft("opname-bimoli", BIMOLI, 3, { createdAt: 1 }),
      serverOpnameDraft("opname-indomie", INDOMIE, 37, { createdAt: 2 }),
    );
    expect(
      await syncOpnameDrafts(store, userIdOf("Rina"), realOpnameSyncApi),
    ).toEqual({
      sent: ["opname-indomie"],
      rejected: ["opname-bimoli"],
      stopped: null,
    });
    expect(await store.get("opname-bimoli")).toMatchObject({
      status: "rejected",
      errors: [
        {
          productId: seedProduct(BIMOLI).id,
          message: "Barang ini tidak dijual lagi",
        },
      ],
    });
    expect(mockDb.get().opnameSessions.map((s) => s.id)).toEqual([
      "opname-indomie",
    ]);
  });

  test("ID sesi sudah dipakai Budi → 409 → rejected 'Data ini milik pengguna lain'; draf Rina utuh", async () => {
    await switchStaff("Budi", "654321");
    const budiId = userIdOf("Budi");
    const budi = await opnameStoreWith(
      serverOpnameDraft("opname-1", INDOMIE, 37, { userId: budiId }),
    );
    expect(
      (await syncOpnameDrafts(budi, budiId, realOpnameSyncApi)).sent,
    ).toEqual(["opname-1"]);
    await switchStaff("Rina", "123456");

    const rina = serverOpnameDraft("opname-1", INDOMIE, 30);
    const store = await opnameStoreWith(rina);
    expect(
      (await syncOpnameDrafts(store, userIdOf("Rina"), realOpnameSyncApi))
        .rejected,
    ).toEqual(["opname-1"]);
    expect(await store.get("opname-1")).toEqual({
      ...rina,
      status: "rejected",
      errors: [{ productId: null, message: "Data ini milik pengguna lain" }],
    });
  });
});
