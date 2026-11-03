import type { ReceiptDraft, ReceiptForm } from "./draft-types";

export type DraftStore = {
  list(): Promise<ReceiptDraft[]>;
  get(id: string): Promise<ReceiptDraft | undefined>;
  put(d: ReceiptDraft): Promise<void>;
  remove(id: string): Promise<void>;
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

function settle<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  const req = indexedDB.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = () => {
    req.result.createObjectStore(STORE, { keyPath: "id" });
  };
  return settle(req);
}

/** Draf di IndexedDB HP: bertahan walau tab ditutup. Koneksi dibuka saat pertama dipakai. */
export function indexedDbDraftStore(): DraftStore {
  let connection: Promise<IDBDatabase> | null = null;
  const connect = (): Promise<IDBDatabase> => {
    connection ??= openDb().then(
      (db) => {
        // Tab lain memutakhirkan versi DB: lepas koneksi agar tidak memblokir, buka lagi nanti.
        db.onversionchange = () => {
          db.close();
          connection = null;
        };
        return db;
      },
      (error: unknown) => {
        connection = null;
        throw error;
      },
    );
    return connection;
  };

  async function run<T>(
    mode: IDBTransactionMode,
    op: (s: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const tx = (await connect()).transaction(STORE, mode);
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("Transaksi dibatalkan"));
    });
    // Selesai = transaksi ter-commit, bukan sekadar request sukses.
    const [result] = await Promise.all([
      settle(op(tx.objectStore(STORE))),
      done,
    ]);
    return result;
  }

  return {
    list: async () =>
      ((await run("readonly", (s) => s.getAll())) as ReceiptDraft[]).sort(
        byCreatedAt,
      ),
    get: async (id) =>
      (await run("readonly", (s) => s.get(id))) as ReceiptDraft | undefined,
    put: async (d) => {
      await run("readwrite", (s) => s.put(d));
    },
    remove: async (id) => {
      await run("readwrite", (s) => s.delete(id));
    },
  };
}

/** Salinan seperti IndexedDB (structured clone); Blob foto dipakai bersama karena tidak berubah. */
function copy(d: ReceiptDraft): ReceiptDraft {
  const { photo, ...rest } = d;
  return { ...structuredClone(rest), photo: photo && { ...photo } };
}

/** Penyimpan di memori untuk test. */
export function memoryDraftStore(): DraftStore {
  const drafts = new Map<string, ReceiptDraft>();
  return {
    list: async () => [...drafts.values()].map(copy).sort(byCreatedAt),
    get: async (id) => {
      const d = drafts.get(id);
      return d && copy(d);
    },
    put: async (d) => {
      drafts.set(d.id, copy(d));
    },
    remove: async (id) => {
      drafts.delete(id);
    },
  };
}
