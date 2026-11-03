import { expect, test } from "vitest";
import { emptyForm, memoryDraftStore } from "./draft-store";
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
