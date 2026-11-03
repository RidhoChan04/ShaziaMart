/** K10: foto nota disimpan terpisah dari `mock.db` agar state tidak membengkak. */
const STORAGE_KEY = "mock.photos";

type Stored = Record<string, { ownerId: string; data: string }>;

/** Foto nota beserta pengunggahnya (foto terikat ke pengunggah). */
export type MockPhoto = { ownerId: string; bytes: Uint8Array };

function toBase64(bytes: Uint8Array): string {
  let s = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

function fromBase64(data: string): Uint8Array {
  const s = atob(data);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function read(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw === null ? {} : JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Stored)
      : {};
  } catch {
    return {};
  }
}

export const mockPhotos = {
  /** Kuota penuh → diabaikan; nota yang memakainya lalu ditolak "Foto nota belum terkirim". */
  save(id: string, ownerId: string, bytes: Uint8Array): void {
    try {
      const all = read();
      all[id] = { ownerId, data: toBase64(bytes) };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
      // abaikan
    }
  },
  load(id: string): MockPhoto | undefined {
    const all = read();
    // hasOwn: id dari path bisa saja "constructor" dsb.
    const stored = Object.hasOwn(all, id) ? all[id] : undefined;
    if (stored === undefined) return undefined;
    return { ownerId: stored.ownerId, bytes: fromBase64(stored.data) };
  },
  reset(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // abaikan
    }
  },
};
