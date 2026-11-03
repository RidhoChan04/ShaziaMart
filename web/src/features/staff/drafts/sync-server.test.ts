import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { problem } from "@/mocks/handlers/respond";
import { staffReceiptHandlers } from "@/mocks/handlers/staff-receipts";
import {
  BIMOLI,
  jpegBytes,
  loginWithShift,
  post,
  staffLogin,
} from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import { mockPhotos } from "@/mocks/photos";
import type { DraftLine } from "@/shared/lib/receipt-rules";
import { emptyForm } from "./draft-store";
import type { ReceiptDraft } from "./draft-types";
import { realSyncApi, syncDrafts } from "./sync";
import { draft, photo, storeWith } from "./sync-fixtures";

describe("syncDrafts lewat server palsu (realSyncApi)", () => {
  const NOW = Date.UTC(2026, 10, 3, 3); // 3 Nov 2026 10.00 WIB
  const INDOMIE = "Indomie Goreng";
  const RECEIPTS = "/api/staff/receipts";

  const productOf = (name: string) => {
    const p = mockDb.get().products.find((x) => x.name === name);
    if (!p) throw new Error(`seed tanpa ${name}`);
    return p;
  };
  const stockOf = (name: string) => mockDb.get().stock[productOf(name).id];
  const userIdOf = (name: string) => {
    const u = mockDb.get().users.find((x) => x.name === name);
    if (!u) throw new Error(`seed tanpa ${name}`);
    return u.id;
  };

  /** Baris draf dari barang seed (salinan seperti hasil pencarian staf). */
  function seedLine(
    lineId: string,
    name: string,
    unitName: string,
    qty: number,
    unitCostText: string,
  ): DraftLine {
    const p = productOf(name);
    const unit = p.units.find((u) => u.name === unitName);
    if (!unit) throw new Error(`seed tanpa ${name} ${unitName}`);
    return {
      lineId,
      product: {
        id: p.id,
        name: p.name,
        category: p.category,
        baseUnit: p.baseUnit,
        units: p.units.map((u) => ({
          id: u.id,
          name: u.name,
          unitSize: u.unitSize,
          barcodes: u.barcodes,
        })),
      },
      unitId: unit.id,
      newProduct: null,
      qty,
      unitCostText,
      expiryDate: null,
    };
  }

  function serverDraft(
    id: string,
    lines: DraftLine[],
    patch: Partial<ReceiptDraft> = {},
  ): ReceiptDraft {
    return draft(id, {
      userId: userIdOf("Rina"),
      form: {
        ...emptyForm("2026-11-02"),
        supplierName: "CV Sumber Rejeki",
        lines,
      },
      ...patch,
    });
  }

  const indomie2dus = () => seedLine("l1", INDOMIE, "dus", 2, "112.000");

  async function switchStaff(name: string, pin: string): Promise<void> {
    await post("/api/staff/logout", {});
    expect((await staffLogin(name, pin)).status).toBe(200);
  }

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    await loginWithShift(1_500_000);
    expect((await staffLogin()).status).toBe(200);
  });

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

  test("R7: id draf sudah dipakai Budi → 409 → 'rejected' dengan pesan; draf Rina utuh", async () => {
    await switchStaff("Budi", "654321");
    const budiId = userIdOf("Budi");
    const budiStore = await storeWith(
      serverDraft("draf-1", [indomie2dus()], { userId: budiId }),
    );
    expect((await syncDrafts(budiStore, budiId, realSyncApi)).sent).toEqual([
      "draf-1",
    ]);
    await switchStaff("Rina", "123456");

    const rinaDraft = serverDraft("draf-1", [
      seedLine("l1", INDOMIE, "dus", 3, "110.000"),
    ]);
    const store = await storeWith(rinaDraft);
    expect(await syncDrafts(store, userIdOf("Rina"), realSyncApi)).toEqual({
      sent: [],
      rejected: ["draf-1"],
      stopped: null,
    });
    const kept = await store.get("draf-1");
    expect(kept?.status).toBe("rejected");
    expect(kept?.form).toEqual(rinaDraft.form);
    expect(kept?.errors).toEqual([
      { lineId: null, field: "lines", message: "Data ini milik pengguna lain" },
    ]);
  });

  test("401 (sesi habis) → stopped 'unauthorized'; 403 STAFF_LAN_ONLY → stopped 'lan'; draf tetap", async () => {
    const store = await storeWith(serverDraft("draf-1", [indomie2dus()]));
    await post("/api/staff/logout", {});
    expect(
      (await syncDrafts(store, userIdOf("Rina"), realSyncApi)).stopped,
    ).toBe("unauthorized");

    expect((await staffLogin()).status).toBe(200);
    server.use(
      http.post(RECEIPTS, () =>
        problem(403, "STAFF_LAN_ONLY", "Hanya bisa dipakai di Wi-Fi toko"),
      ),
    );
    expect(
      (await syncDrafts(store, userIdOf("Rina"), realSyncApi)).stopped,
    ).toBe("lan");
    expect(await store.get("draf-1")).toMatchObject({
      status: "queued",
      errors: [],
    });
    expect(mockDb.get().receipts).toEqual([]);
  });

  test("foto bukan JPEG → 422 dari PUT foto → 'rejected' dengan pesan server; nota tidak dikirim", async () => {
    const store = await storeWith(
      serverDraft("draf-1", [indomie2dus()], {
        photo: photo({ blob: new Blob(["bukan jpeg"]) }),
      }),
    );
    expect(
      (await syncDrafts(store, userIdOf("Rina"), realSyncApi)).rejected,
    ).toEqual(["draf-1"]);
    expect((await store.get("draf-1"))?.errors).toEqual([
      { lineId: null, field: "photoId", message: "Foto nota harus JPEG" },
    ]);
    expect(mockDb.get().receipts).toEqual([]);
  });
});
