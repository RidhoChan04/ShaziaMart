import { describe, expect, test } from "vitest";
import type { StaffReceipt } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { syncDrafts } from "./sync";
import { draft, fakeApi, gate, ids, photo, storeWith } from "./sync-fixtures";

describe("syncDrafts: satu pengiriman pada satu waktu", () => {
  test("dua syncDrafts bersamaan → satu POST", async () => {
    const store = await storeWith(draft("d1"));
    const held = gate();
    const { api, calls } = fakeApi({
      createReceipt: async (input) => {
        await held.wait;
        return { id: input.id } as StaffReceipt;
      },
    });
    const first = syncDrafts(store, "u-rina", api);
    const second = syncDrafts(store, "u-rina", api);
    held.release();
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
    const held = gate();
    const { api, calls } = fakeApi({
      createReceipt: async (input) => {
        await held.wait;
        return { id: input.id } as StaffReceipt;
      },
    });
    const rina = syncDrafts(store, "u-rina", api);
    const budi = syncDrafts(store, "u-budi", api);
    held.release();
    expect((await rina).sent).toEqual(["rina"]);
    expect((await budi).sent).toEqual(["budi"]);
    expect(calls).toEqual(["POST rina", "POST budi"]);
  });
});

describe("syncDrafts: tidak pernah mengirim draf atas nama pengguna lain", () => {
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

  test("ganti pengguna di tengah putaran (sesi kini Budi) → draf Rina berikutnya tidak dikirim; draf tidak diubah", async () => {
    const store = await storeWith(
      draft("d1", { createdAt: 1 }),
      draft("d2", { createdAt: 2, photo: photo() }),
      draft("d3", { createdAt: 3 }),
    );
    let sessionUser = "u-rina";
    const { api, calls } = fakeApi({
      createReceipt: async (input) => {
        sessionUser = "u-budi"; // Budi masuk saat POST d1 berjalan
        return { id: input.id } as StaffReceipt;
      },
    });
    expect(
      await syncDrafts(store, "u-rina", api, {
        currentUserId: () => sessionUser,
      }),
    ).toEqual({ sent: ["d1"], rejected: [], stopped: "unauthorized" });
    expect(calls).toEqual(["POST d1"]);
    expect(await store.list()).toEqual([
      draft("d2", { createdAt: 2, photo: photo() }),
      draft("d3", { createdAt: 3 }),
    ]);
  });

  test("sesi berganti setelah foto terkirim → POST nota tidak dikirim", async () => {
    const store = await storeWith(draft("d1", { photo: photo() }));
    let sessionUser: string | null = "u-rina";
    const { api, calls } = fakeApi({
      putPhoto: async () => {
        sessionUser = null; // keluar
      },
    });
    expect(
      (
        await syncDrafts(store, "u-rina", api, {
          currentUserId: () => sessionUser,
        })
      ).stopped,
    ).toBe("unauthorized");
    expect(calls).toEqual(["PUT foto-1"]);
    expect((await store.get("d1"))?.status).toBe("queued");
  });

  test("sesi bukan pemilik draf sejak awal → tanpa request", async () => {
    const store = await storeWith(draft("d1", { photo: photo() }));
    const { api, calls } = fakeApi();
    expect(
      (
        await syncDrafts(store, "u-rina", api, {
          currentUserId: () => "u-budi",
        })
      ).stopped,
    ).toBe("unauthorized");
    expect(calls).toEqual([]);
  });
});
