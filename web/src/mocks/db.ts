export type MockState = {
  store: { id: string; name: string };
};

const STORAGE_KEY = "mock.db";

function defaults(): MockState {
  return {
    store: { id: "01900000-0000-7000-8000-000000000001", name: "ShaziaMart" },
  };
}

function isState(value: unknown): value is MockState {
  if (typeof value !== "object" || value === null) return false;
  const store = (value as { store?: unknown }).store;
  if (typeof store !== "object" || store === null) return false;
  const { id, name } = store as { id?: unknown; name?: unknown };
  return typeof id === "string" && typeof name === "string";
}

function load(): MockState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (isState(parsed)) return parsed;
    }
  } catch {
    // JSON rusak atau penyimpanan tidak tersedia: pakai default
  }
  return defaults();
}

function persist(state: MockState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // abaikan
  }
}

let current: MockState | null = null;

export const mockDb = {
  /** Salinan: mengubahnya tidak memengaruhi cache; ubah lewat `update`. */
  get(): Readonly<MockState> {
    current ??= load();
    return structuredClone(current);
  },
  update(fn: (s: MockState) => void): void {
    const next = structuredClone(mockDb.get());
    fn(next);
    persist(next);
    current = next;
  },
  reset(): void {
    current = defaults();
    persist(current);
  },
};

/** Hanya untuk test: buang cache memori agar `get()` memuat ulang dari localStorage. */
export function __resetMockDbCacheForTests(): void {
  current = null;
}
