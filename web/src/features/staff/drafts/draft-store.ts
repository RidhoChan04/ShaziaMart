import {
  CORRUPT_DRAFT,
  draftIdentity,
  isIntactDraft,
  isPhoto,
} from "./draft-shape";
import type { ReceiptDraft, ReceiptForm } from "./draft-types";

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
const BLOCKED_MS = 3000;
const DB_BLOCKED =
  "Draf di HP tidak bisa dibuka — tutup tab ShaziaMart lain lalu muat ulang";

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

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let gaveUp = false;
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    // Tab lain memegang versi lama: jangan menunggu tanpa batas.
    req.onblocked = () => {
      timer ??= setTimeout(() => {
        gaveUp = true;
        reject(new Error(DB_BLOCKED));
      }, BLOCKED_MS);
    };
    req.onsuccess = () => {
      clearTimeout(timer);
      if (gaveUp) req.result.close();
      else resolve(req.result);
    };
    req.onerror = () => {
      clearTimeout(timer);
      reject(req.error);
    };
  });
}

/**
 * Draf di IndexedDB HP: bertahan walau tab ditutup. Koneksi dibuka saat pertama dipakai;
 * minta penyimpanan permanen sekali (best-effort) agar browser tidak membuang draf.
 */
export function indexedDbDraftStore(): DraftStore {
  navigator.storage?.persist?.().catch(() => false);
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

  /** Jalankan `body` dalam satu transaksi; selesai = ter-commit. Galat di callback membatalkan. */
  async function transact(
    mode: IDBTransactionMode,
    body: (s: IDBObjectStore, fail: (e: unknown) => void) => void,
  ): Promise<void> {
    const tx = (await connect()).transaction(STORE, mode);
    await new Promise<void>((resolve, reject) => {
      let failure: unknown = null;
      const fail = (e: unknown) => {
        failure = e;
        tx.abort();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(failure ?? tx.error);
      tx.onabort = () =>
        reject(failure ?? tx.error ?? new Error("Transaksi dibatalkan"));
      try {
        body(tx.objectStore(STORE), fail);
      } catch (e) {
        fail(e);
      }
    });
  }

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
