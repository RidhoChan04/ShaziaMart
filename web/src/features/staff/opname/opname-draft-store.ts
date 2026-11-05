import { idbStore } from "../drafts/idb";
import { type OpnameRead, readOpnameDraft } from "./opname-draft-shape";
import type { OpnameDraft } from "./opname-draft-types";

/** Bentuk sama dengan DraftStore nota: semua operasi menolak bila penyimpanan HP gagal. */
export type OpnameDraftStore = {
  list(): Promise<OpnameDraft[]>;
  get(id: string): Promise<OpnameDraft | undefined>;
  put(d: OpnameDraft): Promise<void>;
  remove(id: string): Promise<void>;
  /** Baca versi terbaru lalu tulis dalam satu transaksi; draf hilang/rusak → tidak menulis. */
  update(id: string, change: (d: OpnameDraft) => OpnameDraft): Promise<void>;
};

// DB terpisah dari draf nota (K17): DB nota tidak berubah versi, tanpa migrasi.
const DB_NAME = "kasir-staff-opname";
const DB_VERSION = 1;
const STORE = "opname-drafts";

function readAll(raws: readonly unknown[]): OpnameDraft[] {
  return raws
    .map(readOpnameDraft)
    .filter((r): r is OpnameRead => r !== null)
    .map((r) => r.draft)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** Draf opname di IndexedDB HP. */
export function indexedDbOpnameStore(): OpnameDraftStore {
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
      return readOpnameDraft(raw)?.draft;
    },
    put: (d) => transact("readwrite", (s) => s.put(d)),
    remove: (id) => transact("readwrite", (s) => s.delete(id)),
    update: (id, change) =>
      transact("readwrite", (s, fail) => {
        const req = s.get(id);
        req.onsuccess = () => {
          const read = readOpnameDraft(req.result);
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

/** Penyimpan di memori untuk test (salinan structured clone, penjaga bentuk sama). */
export function memoryOpnameStore(): OpnameDraftStore {
  const records = new Map<string, unknown>();
  const read = (id: string) => readOpnameDraft(records.get(id));
  return {
    list: async () => structuredClone(readAll([...records.values()])),
    get: async (id) => {
      const r = read(id);
      return r ? structuredClone(r.draft) : undefined;
    },
    put: async (d) => {
      records.set(d.id, structuredClone(d));
    },
    remove: async (id) => {
      records.delete(id);
    },
    update: async (id, change) => {
      const r = read(id);
      if (r?.intact) {
        records.set(id, structuredClone(change(structuredClone(r.draft))));
      }
    },
  };
}
