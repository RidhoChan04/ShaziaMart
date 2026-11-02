import type {
  Customer,
  KasirSettings,
  Product,
  Sale,
  Shift,
  ShiftClosure,
  User,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { createSeedState } from "./seed-data";

/** `password` hanya untuk pemilik (login aplikasi pemilik); mock saja. */
export type MockUser = User & { pin: string; password?: string };
/** Shift tertutup + nama kasir dan waktu tutup (untuk ringkasan pemilik). */
export type MockClosedShift = ShiftClosure & {
  kasirName: string;
  closedAt: number;
};
export type MockShift = Shift & { cashSales: number; salesCount: number };
/** HPP disalin saat penjualan; tidak pernah dikirim ke endpoint kasir. */
export type MockSale = Sale & { costTotal: number };

/** Buku kasbon append-only: + kasbon, − pelunasan/batal. */
export type CreditEntry = {
  id: string;
  customerId: string;
  amount: number;
  at: number;
  saleId: string | null;
};

type LoginFailures = Record<
  string,
  { count: number; lockedUntil: number | null }
>;

export type MockState = {
  version: 3;
  store: { id: string; name: string };
  users: MockUser[];
  session: { userId: string } | null;
  pinFailures: LoginFailures;
  ownerSession: { userId: string } | null;
  ownerLoginFailures: LoginFailures;
  shift: MockShift | null;
  closedShifts: MockClosedShift[];
  products: Product[];
  /** productId -> qtyBase */
  stock: Record<string, number>;
  /** productId -> qtyBase */
  minStock: Record<string, number>;
  /** unitId -> HPP per satuan jual (Rp) */
  unitCosts: Record<string, number>;
  sales: MockSale[];
  customers: Customer[];
  /** `customer.balance` selalu = Σ entri pelanggan itu. */
  creditLedger: CreditEntry[];
  settings: KasirSettings;
  /** "YYYYMMDD" -> urutan terakhir */
  saleSeq: Record<string, number>;
};

const STORAGE_KEY = "mock.db";

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/** Pemeriksaan struktur murah (bukan validasi mendalam). */
function isState(value: unknown): value is MockState {
  if (!isObj(value) || value.version !== 3) return false;
  const { store } = value;
  return (
    isObj(store) &&
    typeof store.id === "string" &&
    typeof store.name === "string" &&
    [
      "users",
      "closedShifts",
      "products",
      "sales",
      "customers",
      "creditLedger",
    ].every((k) => Array.isArray(value[k])) &&
    [
      "pinFailures",
      "ownerLoginFailures",
      "stock",
      "minStock",
      "unitCosts",
      "settings",
      "saleSeq",
    ].every((k) => isObj(value[k])) &&
    ["session", "ownerSession", "shift"].every(
      (k) => value[k] === null || isObj(value[k]),
    )
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

// Tab lain (mis. kasir dan pemilik) menulis state yang sama: muat ulang saat berubah.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY || e.key === null) current = null;
  });
}

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
