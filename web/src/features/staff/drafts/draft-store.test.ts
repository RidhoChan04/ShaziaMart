import { afterEach, expect, test, vi } from "vitest";
import { CORRUPT_DRAFT } from "./draft-shape";
import {
  emptyForm,
  indexedDbDraftStore,
  memoryDraftStore,
} from "./draft-store";
import type { ReceiptDraft } from "./draft-types";

const draft = (id: string, createdAt: number): ReceiptDraft => ({
  id,
  userId: "u-rina",
  createdAt,
  updatedAt: createdAt,
  status: "queued",
  form: emptyForm("2026-11-03"),
  photo: null,
  errors: [],
});

const corruptError = { lineId: null, field: "lines", message: CORRUPT_DRAFT };

test("memoryDraftStore: put/get/list (urut createdAt)/remove", async () => {
  const store = memoryDraftStore();
  expect(await store.list()).toEqual([]);
  await store.put(draft("b", 200));
  await store.put(draft("a", 300));
  await store.put(draft("c", 100));
  expect((await store.list()).map((d) => d.id)).toEqual(["c", "b", "a"]);
  expect(await store.get("b")).toEqual(draft("b", 200));
  expect(await store.get("x")).toBeUndefined();

  await store.put({ ...draft("b", 200), status: "rejected" });
  expect((await store.get("b"))?.status).toBe("rejected");
  expect(await store.list()).toHaveLength(3);

  await store.remove("b");
  await store.remove("tidak-ada");
  expect((await store.list()).map((d) => d.id)).toEqual(["c", "a"]);
});

test("memoryDraftStore menyimpan salinan, seperti IndexedDB", async () => {
  const store = memoryDraftStore();
  const d = draft("a", 1);
  await store.put(d);
  d.form.supplierName = "diubah setelah disimpan";
  const got = await store.get("a");
  expect(got?.form.supplierName).toBe("");
  if (got) got.status = "editing";
  expect((await store.get("a"))?.status).toBe("queued");
});

test("foto (Blob) ikut tersimpan", async () => {
  const store = memoryDraftStore();
  const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], {
    type: "image/jpeg",
  });
  await store.put({
    ...draft("a", 1),
    photo: { id: "f1", blob, takenAt: 5, bytes: 3, uploaded: false },
  });
  const photo = (await store.get("a"))?.photo;
  expect(photo?.blob.size).toBe(3);
  expect(photo).toMatchObject({ id: "f1", bytes: 3, uploaded: false });
});

test("update: baca versi terbaru lalu tulis dalam satu langkah; draf hilang → tidak menulis", async () => {
  const store = memoryDraftStore();
  await store.put(draft("a", 1));
  await store.update("a", (d) => ({ ...d, status: "rejected" }));
  expect((await store.get("a"))?.status).toBe("rejected");
  await store.update("x", (d) => ({ ...d, status: "rejected" }));
  expect(await store.get("x")).toBeUndefined();
});

test("rekaman rusak (tanpa form) → tampil sebagai draf ditolak 'rusak' tanpa membuat layar crash; data asli tidak ditimpa update", async () => {
  const store = memoryDraftStore();
  const { form: _form, ...noForm } = draft("rusak", 5);
  await store.put(noForm as unknown as ReceiptDraft);
  await store.put(draft("baik", 1));

  const expected: ReceiptDraft = {
    ...draft("rusak", 5),
    status: "rejected",
    form: emptyForm(""),
    errors: [corruptError] as ReceiptDraft["errors"],
  };
  expect(await store.list()).toEqual([draft("baik", 1), expected]);
  expect(await store.get("rusak")).toEqual(expected);

  const change = vi.fn((d: ReceiptDraft) => d);
  await store.update("rusak", change);
  expect(change).not.toHaveBeenCalled();
});

test.each([
  ["baris null", { lines: [null] }],
  ["qty bukan angka", { lines: [{ ...lineOf(), qty: "2" }] }],
  [
    "barang baru tanpa isian teks",
    { lines: [{ ...lineOf(), newProduct: { name: 1 } }] },
  ],
  ["pembayaran hilang", { payment: undefined }],
])("rekaman rusak (%s) → draf ditolak 'rusak'", async (_, formPatch) => {
  const store = memoryDraftStore();
  const d = draft("rusak", 1);
  await store.put({
    ...d,
    form: { ...d.form, ...formPatch },
  } as unknown as ReceiptDraft);
  expect(await store.get("rusak")).toMatchObject({
    status: "rejected",
    errors: [corruptError],
  });
});

test("rekaman tanpa id/pengguna diabaikan", async () => {
  const store = memoryDraftStore();
  await store.put({ id: "x" } as unknown as ReceiptDraft);
  expect(await store.list()).toEqual([]);
  expect(await store.get("x")).toBeUndefined();
});

function lineOf() {
  return {
    lineId: "l1",
    product: null,
    unitId: null,
    newProduct: null,
    qty: 2,
    unitCostText: "112.000",
    expiryDate: null,
  };
}

test("emptyForm: bayar sekarang, tunai, dari laci, tanpa jatuh tempo", () => {
  expect(emptyForm("2026-11-03")).toEqual({
    supplierName: "",
    notaDate: "2026-11-03",
    lines: [],
    payment: {
      timing: "sekarang",
      method: "tunai",
      cashSource: "laci",
      dueDate: null,
    },
  });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "storage");
});

test("indexedDbDraftStore meminta penyimpanan permanen sekali (best-effort, gagal diabaikan)", async () => {
  const persist = vi.fn(() => Promise.reject(new Error("tidak didukung")));
  Object.defineProperty(navigator, "storage", {
    value: { persist },
    configurable: true,
  });
  indexedDbDraftStore();
  expect(persist).toHaveBeenCalledTimes(1);
  await Promise.resolve();
});

test("indexedDbDraftStore tanpa navigator.storage tetap bisa dibuat", () => {
  expect(() => indexedDbDraftStore()).not.toThrow();
});
