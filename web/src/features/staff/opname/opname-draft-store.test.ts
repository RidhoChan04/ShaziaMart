import { afterEach, expect, test, vi } from "vitest";
import { CORRUPT_DRAFT } from "../drafts/draft-shape";
import { indexedDbOpnameStore, memoryOpnameStore } from "./opname-draft-store";
import type { OpnameDraft } from "./opname-draft-types";
import { opnameDraft } from "./opname-fixtures";

const ids = (drafts: OpnameDraft[]) => drafts.map((d) => d.id);

test("memoryOpnameStore: put/get/list (urut createdAt)/remove", async () => {
  const store = memoryOpnameStore();
  expect(await store.list()).toEqual([]);
  await store.put(opnameDraft("b", { createdAt: 200 }));
  await store.put(opnameDraft("a", { createdAt: 300 }));
  await store.put(opnameDraft("c", { createdAt: 100, status: "counting" }));
  expect(ids(await store.list())).toEqual(["c", "b", "a"]);
  expect(await store.get("b")).toEqual(opnameDraft("b", { createdAt: 200 }));
  expect(await store.get("x")).toBeUndefined();

  await store.remove("b");
  await store.remove("tidak-ada");
  expect(ids(await store.list())).toEqual(["c", "a"]);
});

test("menyimpan salinan, seperti IndexedDB", async () => {
  const store = memoryOpnameStore();
  const d = opnameDraft("a");
  await store.put(d);
  d.counts["p-sarimi"] = { qtyBase: 99, countedAt: 9 };
  const got = await store.get("a");
  expect(got?.counts["p-sarimi"]?.qtyBase).toBe(10);
  if (got) got.status = "counting";
  expect((await store.get("a"))?.status).toBe("queued");
});

test("update: baca versi terbaru lalu tulis; draf hilang → tidak menulis", async () => {
  const store = memoryOpnameStore();
  await store.put(opnameDraft("a"));
  await store.update("a", (d) => ({ ...d, status: "rejected" }));
  expect((await store.get("a"))?.status).toBe("rejected");
  await store.update("x", (d) => ({ ...d, status: "rejected" }));
  expect(await store.get("x")).toBeUndefined();
});

const corrupt = (id: string, createdAt: number): OpnameDraft => ({
  ...opnameDraft(id, { createdAt, updatedAt: createdAt }),
  status: "rejected",
  products: [],
  counts: {},
  errors: [{ productId: null, message: CORRUPT_DRAFT }],
});

test("rekaman rusak (tanpa counts) → draf ditolak 'rusak' dengan lingkupnya; update tidak menimpa data asli", async () => {
  const store = memoryOpnameStore();
  const { counts: _counts, ...noCounts } = opnameDraft("rusak", {
    createdAt: 5,
    updatedAt: 5,
  });
  await store.put(noCounts as unknown as OpnameDraft);
  await store.put(opnameDraft("baik", { createdAt: 1 }));

  expect(await store.list()).toEqual([
    opnameDraft("baik", { createdAt: 1 }),
    corrupt("rusak", 5),
  ]);
  expect(await store.get("rusak")).toEqual(corrupt("rusak", 5));

  const change = vi.fn((d: OpnameDraft) => d);
  await store.update("rusak", change);
  expect(change).not.toHaveBeenCalled();
});

test.each([
  ["status tak dikenal", { status: "editing" }],
  ["hitungan bukan angka", { counts: { "p-sarimi": { qtyBase: "10" } } }],
  ["jam hitung hilang", { counts: { "p-sarimi": { qtyBase: 10 } } }],
  ["barang tanpa satuan", { products: [{ id: "p", name: "X" }] }],
  ["galat tanpa pesan", { errors: [{ productId: null }] }],
  ["jumlah NaN", { counts: { "p-sarimi": { qtyBase: NaN, countedAt: 1 } } }],
  [
    "jam hitung Infinity",
    { counts: { "p-sarimi": { qtyBase: 10, countedAt: Infinity } } },
  ],
  [
    "jumlah pecahan",
    { counts: { "p-sarimi": { qtyBase: 1.5, countedAt: 1 } } },
  ],
  ["createdAt NaN", { createdAt: NaN }],
  ["updatedAt -Infinity", { updatedAt: -Infinity }],
  [
    "isi satuan NaN",
    {
      products: [
        {
          ...opnameDraft("x").products[0],
          units: [{ id: "u", name: "pcs", unitSize: NaN, barcodes: [] }],
        },
      ],
    },
  ],
])("rekaman rusak (%s) → draf ditolak 'rusak'", async (_, patch) => {
  const store = memoryOpnameStore();
  await store.put({
    ...opnameDraft("rusak"),
    ...patch,
  } as unknown as OpnameDraft);
  expect(await store.get("rusak")).toMatchObject({
    status: "rejected",
    errors: [{ productId: null, message: CORRUPT_DRAFT }],
  });
});

test("rekaman rusak dengan jam NaN → createdAt/updatedAt 0 agar urutan daftar tetap stabil", async () => {
  const store = memoryOpnameStore();
  await store.put({
    ...opnameDraft("rusak"),
    createdAt: NaN,
    updatedAt: Infinity,
  });
  await store.put(opnameDraft("baik", { createdAt: 1 }));
  expect(await store.get("rusak")).toMatchObject({
    createdAt: 0,
    updatedAt: 0,
  });
  expect(ids(await store.list())).toEqual(["rusak", "baik"]);
});

test("lingkup rusak → ditampilkan sebagai 'Semua barang'", async () => {
  const store = memoryOpnameStore();
  await store.put({
    ...opnameDraft("rusak"),
    scope: { kind: "rak" },
  } as unknown as OpnameDraft);
  expect((await store.get("rusak"))?.scope).toEqual({
    kind: "semua",
    category: null,
  });
});

test("rekaman tanpa id/pengguna diabaikan", async () => {
  const store = memoryOpnameStore();
  await store.put({ id: "x" } as unknown as OpnameDraft);
  expect(await store.list()).toEqual([]);
  expect(await store.get("x")).toBeUndefined();
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "storage");
});

test("indexedDbOpnameStore tanpa IndexedDB (jsdom) → operasi menolak, tidak melempar saat dibuat", async () => {
  const store = indexedDbOpnameStore();
  await expect(store.list()).rejects.toThrow();
});
