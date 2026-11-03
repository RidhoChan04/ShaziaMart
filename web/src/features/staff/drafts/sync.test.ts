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
import { ApiError } from "@/shared/api/fetcher";
import type {
  ReceiptError,
  ReceiptInput,
  StaffReceipt,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import type { DraftLine } from "@/shared/lib/receipt-rules";
import { emptyForm, memoryDraftStore } from "./draft-store";
import type { DraftPhoto, ReceiptDraft } from "./draft-types";
import { realSyncApi, type SyncApi, syncDrafts } from "./sync";

const line: DraftLine = {
  lineId: "l1",
  product: {
    id: "p-indomie",
    name: "Indomie Goreng",
    category: null,
    baseUnit: "pcs",
    units: [{ id: "u-dus", name: "dus", unitSize: 40, barcodes: [] }],
  },
  unitId: "u-dus",
  newProduct: null,
  qty: 2,
  unitCostText: "112.000",
  expiryDate: null,
};

const photo = (patch: Partial<DraftPhoto> = {}): DraftPhoto => ({
  id: "foto-1",
  blob: new Blob([new Uint8Array([0xff, 0xd8, 0xff])]),
  takenAt: 1,
  bytes: 3,
  uploaded: false,
  ...patch,
});

function draft(id: string, patch: Partial<ReceiptDraft> = {}): ReceiptDraft {
  return {
    id,
    userId: "u-rina",
    createdAt: 1,
    updatedAt: 1,
    status: "queued",
    form: {
      ...emptyForm("2026-11-02"),
      supplierName: "CV Sumber Rejeki",
      lines: [line],
    },
    photo: null,
    errors: [],
    ...patch,
  };
}

async function storeWith(...drafts: ReceiptDraft[]) {
  const store = memoryDraftStore();
  for (const d of drafts) await store.put(d);
  return store;
}

const problemBody = (status: number, code: string, extra = {}) => ({
  type: "about:blank",
  title: "Galat",
  status,
  code,
  ...extra,
});

const apiError = (
  status: number,
  code: ApiError["code"],
  detail?: string,
  extra: Record<string, unknown> = {},
) =>
  new ApiError({
    status,
    code,
    ...(detail === undefined ? {} : { detail }),
    body: problemBody(status, code, {
      ...(detail === undefined ? {} : { detail }),
      ...extra,
    }),
  });

const networkError = () => new ApiError({ status: 0, code: "NETWORK" });

const receiptProblem = (errors: ReceiptError[]) =>
  apiError(422, "VALIDATION", "Nota tidak valid", { errors });

type Handlers = {
  putPhoto?: (id: string) => Promise<void>;
  createReceipt?: (input: ReceiptInput) => Promise<StaffReceipt>;
};

/** API palsu yang mencatat urutan panggilan. */
function fakeApi(handlers: Handlers = {}) {
  const calls: string[] = [];
  const inputs: ReceiptInput[] = [];
  const api: SyncApi = {
    putPhoto: async (id) => {
      calls.push(`PUT ${id}`);
      await handlers.putPhoto?.(id);
    },
    createReceipt: async (input) => {
      calls.push(`POST ${input.id}`);
      inputs.push(input);
      if (handlers.createReceipt) return handlers.createReceipt(input);
      return { id: input.id } as StaffReceipt;
    },
  };
  return { api, calls, inputs };
}

const ids = (drafts: ReceiptDraft[]) => drafts.map((d) => d.id);

describe("syncDrafts dengan API palsu", () => {
  test("draf antre + foto → PUT foto lalu POST nota; draf dihapus; report {sent:[id], rejected:[], stopped:null}", async () => {
    const store = await storeWith(draft("d1", { photo: photo() }));
    const { api, calls, inputs } = fakeApi();
    expect(await syncDrafts(store, "u-rina", api)).toEqual({
      sent: ["d1"],
      rejected: [],
      stopped: null,
    });
    expect(calls).toEqual(["PUT foto-1", "POST d1"]);
    expect(inputs[0]).toMatchObject({ id: "d1", photoId: "foto-1" });
    expect(await store.list()).toEqual([]);
  });

  test("urut createdAt; tanpa draf antre → tanpa request", async () => {
    const store = await storeWith(
      draft("baru", { createdAt: 20 }),
      draft("lama", { createdAt: 10 }),
    );
    const { api, calls } = fakeApi();
    expect((await syncDrafts(store, "u-rina", api)).sent).toEqual([
      "lama",
      "baru",
    ]);
    expect(calls).toEqual(["POST lama", "POST baru"]);
    expect(await syncDrafts(store, "u-rina", api)).toEqual({
      sent: [],
      rejected: [],
      stopped: null,
    });
    expect(calls).toHaveLength(2);
  });

  test("PUT foto gagal NETWORK → stopped 'offline', POST tidak dipanggil, draf tetap queued", async () => {
    const store = await storeWith(
      draft("d1", { photo: photo(), createdAt: 1 }),
      draft("d2", { createdAt: 2 }),
    );
    const { api, calls } = fakeApi({
      putPhoto: () => Promise.reject(networkError()),
    });
    expect(await syncDrafts(store, "u-rina", api)).toEqual({
      sent: [],
      rejected: [],
      stopped: "offline",
    });
    expect(calls).toEqual(["PUT foto-1"]);
    const d1 = await store.get("d1");
    expect(d1?.status).toBe("queued");
    expect(d1?.photo?.uploaded).toBe(false);
    expect(d1?.photo?.blob.size).toBe(3);
    expect(ids(await store.list())).toEqual(["d1", "d2"]);
  });

  test("foto terkirim lalu POST gagal NETWORK → foto ditandai uploaded, tetap di HP; sync berikutnya tanpa PUT kedua", async () => {
    const store = await storeWith(draft("d1", { photo: photo() }));
    let online = false;
    const { api, calls } = fakeApi({
      createReceipt: async (input) => {
        if (!online) throw networkError();
        return { id: input.id } as StaffReceipt;
      },
    });
    expect((await syncDrafts(store, "u-rina", api)).stopped).toBe("offline");
    const kept = await store.get("d1");
    expect(kept?.status).toBe("queued");
    expect(kept?.photo).toMatchObject({ id: "foto-1", uploaded: true });
    expect(kept?.photo?.blob.size).toBe(3);

    online = true;
    expect((await syncDrafts(store, "u-rina", api)).sent).toEqual(["d1"]);
    expect(calls).toEqual(["PUT foto-1", "POST d1", "POST d1"]);
  });

  test("foto uploaded true → tanpa PUT kedua", async () => {
    const store = await storeWith(
      draft("d1", { photo: photo({ uploaded: true }) }),
    );
    const { api, calls, inputs } = fakeApi();
    await syncDrafts(store, "u-rina", api);
    expect(calls).toEqual(["POST d1"]);
    expect(inputs[0]?.photoId).toBe("foto-1");
  });

  test("5xx → stopped 'offline', draf tetap queued", async () => {
    const store = await storeWith(draft("d1"));
    const { api } = fakeApi({
      createReceipt: () => Promise.reject(apiError(503, "INTERNAL")),
    });
    expect((await syncDrafts(store, "u-rina", api)).stopped).toBe("offline");
    expect((await store.get("d1"))?.status).toBe("queued");
  });

  test("401 → stopped 'unauthorized'; 403 STAFF_LAN_ONLY → stopped 'lan'; draf tetap", async () => {
    const store = await storeWith(draft("d1"), draft("d2", { createdAt: 2 }));
    const unauthorized = fakeApi({
      createReceipt: () => Promise.reject(apiError(401, "UNAUTHORIZED")),
    });
    expect(await syncDrafts(store, "u-rina", unauthorized.api)).toEqual({
      sent: [],
      rejected: [],
      stopped: "unauthorized",
    });
    expect(unauthorized.calls).toEqual(["POST d1"]);

    const lan = fakeApi({
      createReceipt: () => Promise.reject(apiError(403, "STAFF_LAN_ONLY")),
    });
    expect((await syncDrafts(store, "u-rina", lan.api)).stopped).toBe("lan");
    expect(lan.calls).toEqual(["POST d1"]);
    const kept = await store.list();
    expect(kept.map((d) => [d.id, d.status, d.errors])).toEqual([
      ["d1", "queued", []],
      ["d2", "queued", []],
    ]);
  });

  test("422 dengan galat per baris → 'rejected' + errors (field server 'qty' tetap melekat ke lineId); draf berikutnya tetap terkirim; tidak dikirim lagi", async () => {
    const errors: ReceiptError[] = [
      {
        lineId: "l1",
        field: "qty",
        message: "Angka terlalu besar — periksa jumlah dan harga beli",
      },
    ];
    const store = await storeWith(
      draft("d1", { createdAt: 1 }),
      draft("d2", { createdAt: 2 }),
    );
    const { api, calls } = fakeApi({
      createReceipt: async (input) => {
        if (input.id === "d1") throw receiptProblem(errors);
        return { id: input.id } as StaffReceipt;
      },
    });
    expect(await syncDrafts(store, "u-rina", api)).toEqual({
      sent: ["d2"],
      rejected: ["d1"],
      stopped: null,
    });
    const rejected = await store.get("d1");
    expect(rejected).toMatchObject({ status: "rejected", errors });
    expect(rejected?.form).toEqual(draft("d1").form);

    await syncDrafts(store, "u-rina", api);
    expect(calls).toEqual(["POST d1", "POST d2"]);
  });

  test("422 body rusak (errors: []) → satu pesan umum tingkat nota, draf disimpan", async () => {
    const store = await storeWith(draft("d1"));
    const { api } = fakeApi({
      createReceipt: () => Promise.reject(receiptProblem([])),
    });
    expect((await syncDrafts(store, "u-rina", api)).rejected).toEqual(["d1"]);
    expect(await store.get("d1")).toMatchObject({
      status: "rejected",
      errors: [{ lineId: null, field: "lines", message: "Nota tidak valid" }],
    });
  });

  test("R7: 409 ID_TAKEN (id milik pengguna lain) → 'rejected' dengan pesan; data draf & foto utuh, tidak pernah dihapus", async () => {
    const store = await storeWith(
      draft("d1", { photo: photo({ uploaded: true }) }),
    );
    const { api } = fakeApi({
      createReceipt: () =>
        Promise.reject(
          apiError(409, "ID_TAKEN", "ID ini sudah dipakai pengguna lain"),
        ),
    });
    expect(await syncDrafts(store, "u-rina", api)).toEqual({
      sent: [],
      rejected: ["d1"],
      stopped: null,
    });
    const kept = await store.get("d1");
    expect(kept).toMatchObject({
      status: "rejected",
      errors: [
        {
          lineId: null,
          field: "lines",
          message: "Data ini milik pengguna lain",
        },
      ],
    });
    expect(kept?.form).toEqual(draft("d1").form);
    expect(kept?.photo?.blob.size).toBe(3);
  });

  test("PUT foto 422 (terlalu besar) → 'rejected' dengan galat foto; POST tidak dipanggil; draf berikut tetap terkirim", async () => {
    const store = await storeWith(
      draft("d1", { photo: photo(), createdAt: 1 }),
      draft("d2", { createdAt: 2 }),
    );
    const { api, calls } = fakeApi({
      putPhoto: () =>
        Promise.reject(
          apiError(422, "VALIDATION", "Foto nota terlalu besar (maks. 1 MB)"),
        ),
    });
    expect(await syncDrafts(store, "u-rina", api)).toEqual({
      sent: ["d2"],
      rejected: ["d1"],
      stopped: null,
    });
    expect(calls).toEqual(["PUT foto-1", "POST d2"]);
    expect(await store.get("d1")).toMatchObject({
      status: "rejected",
      errors: [
        {
          lineId: null,
          field: "photoId",
          message: "Foto nota terlalu besar (maks. 1 MB)",
        },
      ],
      photo: { uploaded: false },
    });
  });

  test("POST ditolak 'Foto nota belum terkirim' → foto ditandai belum terkirim agar diunggah ulang setelah disimpan lagi", async () => {
    const store = await storeWith(
      draft("d1", { photo: photo({ uploaded: true }) }),
    );
    const { api } = fakeApi({
      createReceipt: () =>
        Promise.reject(
          receiptProblem([
            {
              lineId: null,
              field: "photoId",
              message: "Foto nota belum terkirim",
            },
          ]),
        ),
    });
    await syncDrafts(store, "u-rina", api);
    expect(await store.get("d1")).toMatchObject({
      status: "rejected",
      photo: { id: "foto-1", uploaded: false },
    });
  });

  test("draf Rina tidak dikirim saat Budi login; draf 'editing' tidak pernah dikirim", async () => {
    const store = await storeWith(
      draft("rina", { userId: "u-rina" }),
      draft("budi", { userId: "u-budi", createdAt: 2 }),
      draft("budi-edit", { userId: "u-budi", status: "editing", createdAt: 3 }),
    );
    const { api, calls } = fakeApi();
    expect((await syncDrafts(store, "u-budi", api)).sent).toEqual(["budi"]);
    expect(calls).toEqual(["POST budi"]);
    expect(ids(await store.list())).toEqual(["rina", "budi-edit"]);

    expect((await syncDrafts(store, "u-rina", api)).sent).toEqual(["rina"]);
    expect(ids(await store.list())).toEqual(["budi-edit"]);
  });

  test("dua syncDrafts bersamaan → satu POST", async () => {
    const store = await storeWith(draft("d1"));
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { api, calls } = fakeApi({
      createReceipt: async (input) => {
        await gate;
        return { id: input.id } as StaffReceipt;
      },
    });
    const first = syncDrafts(store, "u-rina", api);
    const second = syncDrafts(store, "u-rina", api);
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(calls).toEqual(["POST d1"]);
    expect(a).toEqual({ sent: ["d1"], rejected: [], stopped: null });
    expect(b).toEqual(a);
  });

  test("sync pengguna lain saat sync berjalan → menunggu giliran, lalu mengirim draf pengguna itu", async () => {
    const store = await storeWith(
      draft("rina"),
      draft("budi", { userId: "u-budi", createdAt: 2 }),
    );
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { api, calls } = fakeApi({
      createReceipt: async (input) => {
        await gate;
        return { id: input.id } as StaffReceipt;
      },
    });
    const rina = syncDrafts(store, "u-rina", api);
    const budi = syncDrafts(store, "u-budi", api);
    release();
    expect((await rina).sent).toEqual(["rina"]);
    expect((await budi).sent).toEqual(["budi"]);
    expect(calls).toEqual(["POST rina", "POST budi"]);
  });

  test("draf yang diantre saat sync berjalan ikut terkirim di putaran yang sama", async () => {
    const store = await storeWith(draft("d1"));
    const { api, calls } = fakeApi({
      createReceipt: async (input) => {
        if (input.id === "d1") await store.put(draft("d2", { createdAt: 2 }));
        return { id: input.id } as StaffReceipt;
      },
    });
    expect((await syncDrafts(store, "u-rina", api)).sent).toEqual(["d1", "d2"]);
    expect(calls).toEqual(["POST d1", "POST d2"]);
  });

  test("dibatalkan (pengguna keluar) → tidak ada request berikutnya; draf tetap", async () => {
    const store = await storeWith(
      draft("d1", { photo: photo() }),
      draft("d2", { createdAt: 2 }),
    );
    const controller = new AbortController();
    const { api, calls } = fakeApi({
      putPhoto: async () => controller.abort(),
    });
    expect(
      await syncDrafts(store, "u-rina", api, { signal: controller.signal }),
    ).toEqual({ sent: [], rejected: [], stopped: "unauthorized" });
    expect(calls).toEqual(["PUT foto-1"]);
    expect(ids(await store.list())).toEqual(["d1", "d2"]);
  });

  test("galat bukan dari API (bug) tidak ditelan; draf tetap", async () => {
    const store = await storeWith(draft("d1"));
    const { api } = fakeApi({
      createReceipt: () => Promise.reject(new TypeError("rusak")),
    });
    await expect(syncDrafts(store, "u-rina", api)).rejects.toThrow("rusak");
    expect((await store.get("d1"))?.status).toBe("queued");
  });
});

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
