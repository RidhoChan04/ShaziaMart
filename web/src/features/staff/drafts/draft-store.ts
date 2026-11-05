import {
  CORRUPT_DRAFT,
  draftIdentity,
  isIntactDraft,
  isPhoto,
} from "./draft-shape";
import type { ReceiptDraft, ReceiptForm } from "./draft-types";
import { idbStore } from "./idb";

/** Semua operasi menolak (reject) bila penyimpanan HP gagal; tidak ada yang ditelan. */
export type DraftStore = {
  list(): Promise<ReceiptDraft[]>;
  get(id: string): Promise<ReceiptDraft | undefined>;
  put(d: ReceiptDraft): Promise<void>;
  remove(id: string): Promise<void>;
  /** Baca versi terbaru lalu tulis dalam satu transaksi; draf hilang/rusak → tidak menulis. */
  update(id: string, change: (d: ReceiptDraft) => ReceiptDraft): Promise<void>;
};

const DB_NAME = "kasir-staff";
const DB_VERSION = 1;
const STORE = "receipt-drafts";

const byCreatedAt = (a: ReceiptDraft, b: ReceiptDraft) =>
  a.createdAt - b.createdAt;

/** Form kosong: bayar sekarang, tunai, dari laci. */
export function emptyForm(today: string): ReceiptForm {
  return {
    supplierName: "",
    notaDate: today,
    lines: [],
    payment: {
      timing: "sekarang",
      method: "tunai",
      cashSource: "laci",
      dueDate: null,
    },
  };
}

type Read = { draft: ReceiptDraft; intact: boolean };

/**
 * Rekaman tersimpan → draf yang aman ditampilkan. Rekaman rusak tampil sebagai draf ditolak
 * "rusak" (form kosong, foto dipertahankan bila utuh) tanpa menimpa data aslinya.
 */
function readDraft(raw: unknown): Read | null {
  if (isIntactDraft(raw)) return { draft: raw, intact: true };
  const identity = draftIdentity(raw);
  if (identity === null) return null;
  const photo = (raw as { photo?: unknown }).photo;
  return {
    intact: false,
    draft: {
      ...identity,
      status: "rejected",
      form: emptyForm(""),
      photo: isPhoto(photo) ? photo : null,
      errors: [{ lineId: null, field: "lines", message: CORRUPT_DRAFT }],
    },
  };
}

function readAll(raws: readonly unknown[]): ReceiptDraft[] {
  return raws
    .map(readDraft)
    .filter((r): r is Read => r !== null)
    .map((r) => r.draft)
    .sort(byCreatedAt);
}

/** Draf nota di IndexedDB HP (DB `kasir-staff`, tanpa perubahan skema). */
export function indexedDbDraftStore(): DraftStore {
  const { transact } = idbStore(DB_NAME, DB_VERSION, STORE);
  return {
    list: async () => {
      let raws: unknown[] = [];
      await transact("readonly", (s) => {
        const req = s.getAll();
        req.onsuccess = () => {
          raws = req.result;
        };
      });
      return readAll(raws);
    },
    get: async (id) => {
      let raw: unknown;
      await transact("readonly", (s) => {
        const req = s.get(id);
        req.onsuccess = () => {
          raw = req.result;
        };
      });
      return readDraft(raw)?.draft;
    },
    put: (d) => transact("readwrite", (s) => s.put(d)),
    remove: (id) => transact("readwrite", (s) => s.delete(id)),
    update: (id, change) =>
      transact("readwrite", (s, fail) => {
        const req = s.get(id);
        req.onsuccess = () => {
          const read = readDraft(req.result);
          if (!read?.intact) return;
          try {
            s.put(change(read.draft));
          } catch (e) {
            fail(e);
          }
        };
      }),
  };
}

/** Salinan seperti IndexedDB (structured clone); Blob foto dipakai bersama karena tidak berubah. */
function copy(d: ReceiptDraft): ReceiptDraft {
  const { photo, ...rest } = d;
  return { ...structuredClone(rest), photo: photo && { ...photo } };
}

/** Penyimpan di memori untuk test (penjaga bentuk sama dengan IndexedDB). */
export function memoryDraftStore(): DraftStore {
  const records = new Map<string, unknown>();
  const read = (id: string) => readDraft(records.get(id));
  return {
    list: async () => readAll([...records.values()]).map((d) => copy(d)),
    get: async (id) => {
      const r = read(id);
      return r ? copy(r.draft) : undefined;
    },
    put: async (d) => {
      records.set(d.id, copy(d));
    },
    remove: async (id) => {
      records.delete(id);
    },
    update: async (id, change) => {
      const r = read(id);
      if (r?.intact) records.set(id, copy(change(copy(r.draft))));
    },
  };
}
