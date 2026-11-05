const BLOCKED_MS = 3000;
const DB_BLOCKED =
  "Draf di HP tidak bisa dibuka — tutup tab ShaziaMart lain lalu muat ulang";

function openDb(
  dbName: string,
  version: number,
  storeName: string,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, version);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let gaveUp = false;
    req.onupgradeneeded = () => {
      req.result.createObjectStore(storeName, { keyPath: "id" });
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
 * Satu object store IndexedDB di HP (kunci `id`): bertahan walau tab ditutup. Koneksi dibuka
 * saat pertama dipakai; minta penyimpanan permanen sekali (best-effort) agar browser tidak
 * membuang draf.
 */
export function idbStore(
  dbName: string,
  version: number,
  storeName: string,
): {
  transact(
    mode: IDBTransactionMode,
    body: (s: IDBObjectStore, fail: (e: unknown) => void) => void,
  ): Promise<void>;
} {
  navigator.storage?.persist?.().catch(() => false);
  let connection: Promise<IDBDatabase> | null = null;
  const connect = (): Promise<IDBDatabase> => {
    connection ??= openDb(dbName, version, storeName).then(
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

  return {
    /** Jalankan `body` dalam satu transaksi; selesai = ter-commit. Galat di callback membatalkan. */
    async transact(mode, body) {
      const tx = (await connect()).transaction(storeName, mode);
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
          body(tx.objectStore(storeName), fail);
        } catch (e) {
          fail(e);
        }
      });
    },
  };
}
