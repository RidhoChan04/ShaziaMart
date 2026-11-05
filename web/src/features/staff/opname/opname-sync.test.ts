import { describe, expect, test } from "vitest";
import type { StaffOpnameSession } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { ID_TAKEN_MESSAGE } from "@/shared/lib/error-messages";
import { CORRUPT_DRAFT } from "../drafts/draft-shape";
import { apiError, gate, networkError } from "../drafts/sync-fixtures";
import type { OpnameDraft } from "./opname-draft-types";
import {
  fakeOpnameApi,
  opnameDraft,
  opnameProblem,
  opnameStoreWith,
} from "./opname-fixtures";
import { syncOpnameDrafts, toSessionInput } from "./opname-sync";

const ids = (drafts: OpnameDraft[]) => drafts.map((d) => d.id);

describe("toSessionInput", () => {
  test("membawa countedAt asli dan deviceNow kirim; ID sesi = ID draf; hanya barang yang dihitung, urut nama", () => {
    expect(toSessionInput(opnameDraft("draf-1"), 9_000)).toEqual({
      id: "draf-1",
      scope: { kind: "kategori", category: "Mi Instan" },
      deviceNow: 9_000,
      items: [
        { productId: "p-indomie", qtyBase: 40, countedAt: 1_001 },
        { productId: "p-sarimi", qtyBase: 10, countedAt: 1_005 },
      ],
    });
  });
});

describe("syncOpnameDrafts: kirim draf antre", () => {
  test("antre → terkirim dengan deviceNow = jam HP saat kirim → draf hilang", async () => {
    const store = await opnameStoreWith(opnameDraft("d1"));
    const { api, inputs } = fakeOpnameApi();
    let clock = 5_000;
    const report = await syncOpnameDrafts(store, "u-rina", api, {
      now: () => {
        clock += 1;
        return clock;
      },
    });
    expect(report).toEqual({ sent: ["d1"], rejected: [], stopped: null });
    expect(inputs).toEqual([toSessionInput(opnameDraft("d1"), 5_001)]);
    expect(await store.list()).toEqual([]);
  });

  test("hanya draf `queued` milik pengguna itu, urut createdAt; sedang dihitung/ditolak/milik Budi tidak dikirim", async () => {
    const store = await opnameStoreWith(
      opnameDraft("b", { createdAt: 3 }),
      opnameDraft("a", { createdAt: 2 }),
      opnameDraft("hitung", { status: "counting" }),
      opnameDraft("tolak", { status: "rejected" }),
      opnameDraft("budi", { userId: "u-budi" }),
    );
    const { api, posted } = fakeOpnameApi();
    expect((await syncOpnameDrafts(store, "u-rina", api)).sent).toEqual([
      "a",
      "b",
    ]);
    expect(posted()).toEqual(["a", "b"]);
    expect(ids(await store.list())).toEqual(["hitung", "tolak", "budi"]);
  });

  test("422 barang nonaktif → rejected dengan errors per productId, data hitungan utuh; draf lain tetap terkirim", async () => {
    const errors = [
      { productId: "p-sarimi", message: "Barang ini tidak dijual lagi" },
    ];
    const store = await opnameStoreWith(
      opnameDraft("lama", { createdAt: 1 }),
      opnameDraft("baru", { createdAt: 2 }),
    );
    const { api } = fakeOpnameApi(async (input) => {
      if (input.id === "lama") throw opnameProblem(errors);
      return { id: input.id } as StaffOpnameSession;
    });
    expect(await syncOpnameDrafts(store, "u-rina", api)).toEqual({
      sent: ["baru"],
      rejected: ["lama"],
      stopped: null,
    });
    expect(await store.list()).toEqual([
      opnameDraft("lama", { createdAt: 1, status: "rejected", errors }),
    ]);
  });

  test.each([
    [
      "422 tanpa galat per barang",
      opnameProblem([]),
      "Hitungan opname tidak valid",
    ],
    ["409 ID_TAKEN", apiError(409, "ID_TAKEN"), ID_TAKEN_MESSAGE],
    ["bukan galat API (draf tak bisa dikirim)", new Error("x"), CORRUPT_DRAFT],
  ])("%s → rejected dengan satu pesan umum", async (_, error, message) => {
    const store = await opnameStoreWith(opnameDraft("d1"));
    const { api } = fakeOpnameApi(() => Promise.reject(error));
    expect((await syncOpnameDrafts(store, "u-rina", api)).rejected).toEqual([
      "d1",
    ]);
    expect(await store.get("d1")).toEqual(
      opnameDraft("d1", {
        status: "rejected",
        errors: [{ productId: null, message }],
      }),
    );
  });

  test.each([
    ["offline", networkError(), "offline"],
    ["server 503", apiError(503, "INTERNAL"), "offline"],
    ["di luar jaringan toko", apiError(403, "STAFF_LAN_ONLY"), "lan"],
    ["401", apiError(401, "UNAUTHORIZED"), "unauthorized"],
  ] as const)(
    "%s → berhenti, draf tetap queued, draf berikutnya tidak dicoba",
    async (_, error, stopped) => {
      const store = await opnameStoreWith(
        opnameDraft("d1", { createdAt: 1 }),
        opnameDraft("d2", { createdAt: 2 }),
      );
      const { api, posted } = fakeOpnameApi(() => Promise.reject(error));
      expect(await syncOpnameDrafts(store, "u-rina", api)).toEqual({
        sent: [],
        rejected: [],
        stopped,
      });
      expect(posted()).toEqual(["d1"]);
      expect(await store.list()).toEqual([
        opnameDraft("d1", { createdAt: 1 }),
        opnameDraft("d2", { createdAt: 2 }),
      ]);
    },
  );

  test("rekaman rusak tidak pernah dikirim; tampil 'rusak' tanpa data ditimpa", async () => {
    const store = await opnameStoreWith();
    await store.put({ ...opnameDraft("rusak"), counts: null } as never);
    const { api, posted } = fakeOpnameApi();
    expect((await syncOpnameDrafts(store, "u-rina", api)).sent).toEqual([]);
    expect(posted()).toEqual([]);
    expect((await store.get("rusak"))?.errors).toEqual([
      { productId: null, message: CORRUPT_DRAFT },
    ]);
  });
});

describe("syncOpnameDrafts: sesi & satu pengiriman pada satu waktu", () => {
  test("dua sync bersamaan → satu POST", async () => {
    const store = await opnameStoreWith(opnameDraft("d1"));
    const held = gate();
    const { api, posted } = fakeOpnameApi(async (input) => {
      await held.wait;
      return { id: input.id } as StaffOpnameSession;
    });
    const first = syncOpnameDrafts(store, "u-rina", api);
    const second = syncOpnameDrafts(store, "u-rina", api);
    held.release();
    const [a, b] = await Promise.all([first, second]);
    expect(posted()).toEqual(["d1"]);
    expect(b).toEqual(a);
  });

  test("sesi (cache) milik Budi / dibatalkan / sesi segar milik Budi → tanpa request, draf tetap", async () => {
    const store = await opnameStoreWith(opnameDraft("d1"));
    const { api, posted } = fakeOpnameApi();
    const aborted = new AbortController();
    aborted.abort();
    for (const opts of [
      { currentUserId: () => "u-budi" },
      { signal: aborted.signal },
      { freshUserId: async () => "u-budi" },
    ]) {
      expect((await syncOpnameDrafts(store, "u-rina", api, opts)).stopped).toBe(
        "unauthorized",
      );
    }
    expect(posted()).toEqual([]);
    expect(await store.get("d1")).toEqual(opnameDraft("d1"));
  });

  test("ganti pengguna di tengah putaran → draf Rina berikutnya tidak dikirim", async () => {
    const store = await opnameStoreWith(
      opnameDraft("d1", { createdAt: 1 }),
      opnameDraft("d2", { createdAt: 2 }),
    );
    let sessionUser = "u-rina";
    const { api, posted } = fakeOpnameApi(async (input) => {
      sessionUser = "u-budi";
      return { id: input.id } as StaffOpnameSession;
    });
    expect(
      await syncOpnameDrafts(store, "u-rina", api, {
        currentUserId: () => sessionUser,
      }),
    ).toEqual({ sent: ["d1"], rejected: [], stopped: "unauthorized" });
    expect(posted()).toEqual(["d1"]);
    expect(ids(await store.list())).toEqual(["d2"]);
  });
});
