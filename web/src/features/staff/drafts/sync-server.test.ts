import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, test } from "vitest";
import { mockDb } from "@/mocks/db";
import { staffReceiptHandlers } from "@/mocks/handlers/staff-receipts";
import { BIMOLI, jpegBytes } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import { mockPhotos } from "@/mocks/photos";
import { realSyncApi, syncDrafts } from "./sync";
import { photo, storeWith } from "./sync-fixtures";
import {
  INDOMIE,
  indomie2dus,
  RECEIPTS,
  seedLine,
  serverDraft,
  startServerSync,
  stockOf,
  userIdOf,
} from "./sync-server-kit";

describe("syncDrafts lewat server palsu (realSyncApi): terkirim dan ditolak per baris", () => {
  beforeEach(startServerSync);

  test("draf antre + foto JPEG → foto tersimpan milik Rina, nota memuat photoId; draf dihapus", async () => {
    const bytes = jpegBytes(2048);
    const store = await storeWith(
      serverDraft("draf-1", [indomie2dus()], {
        photo: photo({ blob: new Blob([bytes.slice()]), bytes: 2048 }),
      }),
    );
    expect(await syncDrafts(store, userIdOf("Rina"), realSyncApi)).toEqual({
      sent: ["draf-1"],
      rejected: [],
      stopped: null,
    });
    expect(mockPhotos.load("foto-1")?.ownerId).toBe(userIdOf("Rina"));
    expect(mockPhotos.load("foto-1")?.bytes.length).toBe(2048);
    const saved = mockDb.get().receipts.find((r) => r.id === "draf-1");
    expect(saved?.photoId).toBe("foto-1");
    expect(await store.list()).toEqual([]);
  });

  test("respons hilang: handler POST menyimpan lalu HttpResponse.error() → offline; sync berikutnya 200 replay → draf hilang; stok Indomie +80 sekali", async () => {
    const before = stockOf(INDOMIE) ?? 0;
    const [realPost] = staffReceiptHandlers;
    if (!realPost) throw new Error("tanpa handler POST nota");
    let posts = 0;
    server.use(
      http.post(
        RECEIPTS,
        async ({ request, requestId }) => {
          posts += 1;
          await realPost.run({ request, requestId });
          return HttpResponse.error();
        },
        { once: true },
      ),
    );
    const store = await storeWith(serverDraft("draf-1", [indomie2dus()]));

    expect(await syncDrafts(store, userIdOf("Rina"), realSyncApi)).toEqual({
      sent: [],
      rejected: [],
      stopped: "offline",
    });
    expect(posts).toBe(1);
    expect(stockOf(INDOMIE)).toBe(before + 80);
    expect((await store.get("draf-1"))?.status).toBe("queued");

    expect(await syncDrafts(store, userIdOf("Rina"), realSyncApi)).toEqual({
      sent: ["draf-1"],
      rejected: [],
      stopped: null,
    });
    expect(await store.list()).toEqual([]);
    expect(stockOf(INDOMIE)).toBe(before + 80);
    expect(mockDb.get().receipts.filter((r) => r.id === "draf-1")).toHaveLength(
      1,
    );
  });

  test("422 (Bimoli nonaktif) → status 'rejected' dengan errors; draf berikutnya tetap terkirim; draf ditolak tidak dikirim lagi", async () => {
    mockDb.update((s) => {
      const p = s.products.find((x) => x.name === BIMOLI);
      if (p) p.status = "nonaktif";
    });
    const store = await storeWith(
      serverDraft(
        "draf-bimoli",
        [seedLine("l2", BIMOLI, "pcs", 12, "34.000")],
        { createdAt: 1 },
      ),
      serverDraft("draf-indomie", [indomie2dus()], { createdAt: 2 }),
    );
    expect(await syncDrafts(store, userIdOf("Rina"), realSyncApi)).toEqual({
      sent: ["draf-indomie"],
      rejected: ["draf-bimoli"],
      stopped: null,
    });
    expect(await store.get("draf-bimoli")).toMatchObject({
      status: "rejected",
      errors: [
        {
          lineId: "l2",
          field: "product",
          message: "Barang ini tidak dijual lagi",
        },
      ],
    });
    expect(mockDb.get().receipts.map((r) => r.id)).toEqual(["draf-indomie"]);

    let posts = 0;
    const count = ({ request }: { request: Request }) => {
      if (request.method === "POST") posts += 1;
    };
    server.events.on("request:start", count);
    expect(await syncDrafts(store, userIdOf("Rina"), realSyncApi)).toEqual({
      sent: [],
      rejected: [],
      stopped: null,
    });
    server.events.removeListener("request:start", count);
    expect(posts).toBe(0);
  });
});
