import type {
  Customer,
  KasirSettings,
  Product,
  Sale,
  Shift,
  ShiftClosure,
  User,
} from "../shared/api/gen/shaziaMartAPI.schemas";
import { createSeedState } from "./seed-data";

export type MockUser = User & { pin: string };
export type MockShift = Shift & { cashSales: number; salesCount: number };

export type MockState = {
  version: 2;
  store: { id: string; name: string };
  users: MockUser[];
  session: { userId: string } | null;
  pinFailures: Record<string, { count: number; lockedUntil: number | null }>;
  shift: MockShift | null;
  closedShifts: ShiftClosure[];
  products: Product[];
  /** productId -> qtyBase */
  stock: Record<string, number>;
  sales: Sale[];
  customers: Customer[];
  settings: KasirSettings;
  /** "YYYYMMDD" -> urutan terakhir */
  saleSeq: Record<string, number>;
};

const STORAGE_KEY = "mock.db";

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/** Pemeriksaan struktur murah (bukan validasi mendalam). */
function isState(value: unknown): value is MockState {
  if (!isObj(value) || value.version !== 2) return false;
  const { store } = value;
  return (
    isObj(store) &&
    typeof store.id === "string" &&
    typeof store.name === "string" &&
    ["users", "closedShifts", "products", "sales", "customers"].every((k) =>
      Array.isArray(value[k]),
    ) &&
    ["pinFailures", "stock", "settings", "saleSeq"].every((k) =>
      isObj(value[k]),
    ) &&
    (value.session === null || isObj(value.session)) &&
    (value.shift === null || isObj(value.shift))
  );
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
  return createSeedState();
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
    current = createSeedState();
    persist(current);
  },
};

/** Hanya untuk test: buang cache memori agar `get()` memuat ulang dari localStorage. */
export function __resetMockDbCacheForTests(): void {
  current = null;
}
