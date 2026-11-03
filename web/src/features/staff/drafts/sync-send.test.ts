import { describe, expect, test } from "vitest";
import type { StaffReceipt } from "@/shared/api/gen/shaziaMartAPI.schemas";
import type { ReceiptDraft } from "./draft-types";
import { syncDrafts } from "./sync";
import {
  draft,
  fakeApi,
  ids,
  networkError,
  photo,
  storeWith,
} from "./sync-fixtures";

describe("syncDrafts: urutan kirim dan foto", () => {
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

  test("tanda foto terkirim tidak menimpa isian yang diubah selama sync", async () => {
    const store = await storeWith(draft("d1", { photo: photo() }));
    const { api } = fakeApi({
      putPhoto: async () => {
        const d = await store.get("d1");
        if (d) {
          await store.put({
            ...d,
            form: { ...d.form, supplierName: "CV Baru" },
          });
        }
      },
      createReceipt: () => Promise.reject(networkError()),
    });
    await syncDrafts(store, "u-rina", api);
    expect(await store.get("d1")).toMatchObject({
      form: { supplierName: "CV Baru" },
      photo: { uploaded: true },
    });
  });
});

describe("syncDrafts: draf mana yang dikirim", () => {
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

  test("draf beracun: rekaman tanpa form + draf baik → yang baik terkirim, yang rusak tampil ditolak tanpa request", async () => {
    const { form: _form, ...noForm } = draft("rusak", { createdAt: 1 });
    const store = await storeWith(
      noForm as unknown as ReceiptDraft,
      draft("baik", { createdAt: 2 }),
    );
    const { api, calls } = fakeApi();
    expect(await syncDrafts(store, "u-rina", api)).toEqual({
      sent: ["baik"],
      rejected: [],
      stopped: null,
    });
    expect(calls).toEqual(["POST baik"]);
    expect(await store.get("rusak")).toMatchObject({
      status: "rejected",
      errors: [
        {
          lineId: null,
          field: "lines",
          message: "Draf ini rusak — buka dan periksa lagi",
        },
      ],
    });
  });
});
