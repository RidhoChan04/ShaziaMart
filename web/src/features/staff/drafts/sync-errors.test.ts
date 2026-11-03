import { describe, expect, test } from "vitest";
import type {
  ReceiptError,
  StaffReceipt,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { syncDrafts } from "./sync";
import {
  apiError,
  draft,
  fakeApi,
  photo,
  receiptProblem,
  storeWith,
} from "./sync-fixtures";

const CORRUPT = {
  lineId: null,
  field: "lines",
  message: "Draf ini rusak — buka dan periksa lagi",
};

describe("syncDrafts: berhenti sementara (draf tetap antre)", () => {
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
});

describe("syncDrafts: ditolak (draf disimpan dengan pesan, draf lain jalan terus)", () => {
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
});

describe("syncDrafts: draf rusak tidak menghentikan antrean", () => {
  test("galat bukan ApiError saat membuat/mengirim nota (draf rusak) → draf itu 'rejected' rusak; draf berikut tetap terkirim", async () => {
    const store = await storeWith(
      draft("d1", { createdAt: 1 }),
      draft("d2", { createdAt: 2 }),
    );
    const { api, calls } = fakeApi({
      createReceipt: async (input) => {
        if (input.id === "d1") throw new TypeError("rusak");
        return { id: input.id } as StaffReceipt;
      },
    });
    expect(await syncDrafts(store, "u-rina", api)).toEqual({
      sent: ["d2"],
      rejected: ["d1"],
      stopped: null,
    });
    expect(calls).toEqual(["POST d1", "POST d2"]);
    const kept = await store.get("d1");
    expect(kept).toMatchObject({ status: "rejected", errors: [CORRUPT] });
    expect(kept?.form).toEqual(draft("d1").form);
  });

  test("penyimpan HP gagal → galat dilempar (bukan ditelan), tanpa request", async () => {
    const store = await storeWith(draft("d1"));
    store.list = () => Promise.reject(new Error("QuotaExceededError"));
    const { api, calls } = fakeApi();
    await expect(syncDrafts(store, "u-rina", api)).rejects.toThrow(
      "QuotaExceededError",
    );
    expect(calls).toEqual([]);
  });
});
