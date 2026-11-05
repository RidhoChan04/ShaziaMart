import type {
  CostAlert,
  Customer,
  DebtPayment,
  KasirSettings,
  OpnameItemState,
  OpnameReason,
  OpnameScope,
  PriceHistoryEntry,
  Product,
  ProductCost,
  ProductStatus,
  ProductUnit,
  ReceiptAuditEntry,
  ReceiptLine,
  ReceiptPayment,
  ReceiptStatus,
  Sale,
  Shift,
  ShiftClosure,
  Supplier,
  User,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { mockPhotos } from "./photos";
import { createSeedState } from "./seed-data";

/** `password` hanya untuk pemilik (login aplikasi pemilik); mock saja. */
export type MockUser = User & { pin: string; password?: string };
/** Shift tertutup + nama kasir dan waktu tutup (untuk ringkasan pemilik). */
export type MockClosedShift = ShiftClosure & {
  kasirName: string;
  closedAt: number;
};
/** Uang keluar laci di shift ini (barang masuk, koreksi nota, pelunasan utang); keluar = positif. */
export type MockCashOut = {
  id: string;
  at: number;
  amount: number;
  receiptId: string;
  kind: "bayar" | "koreksi" | "lunas";
};
export type MockShift = Shift & {
  cashSales: number;
  salesCount: number;
  cashOuts: MockCashOut[];
};
/** HPP disalin saat penjualan; tidak pernah dikirim ke endpoint kasir. */
export type MockSale = Sale & { costTotal: number; voidedAt: number | null };

/** `active: false` = satuan nonaktif: tidak dijual kasir, barcodenya tetap terpakai. */
export type MockUnit = ProductUnit & { active: boolean };
/** Barang lengkap; kasir hanya melihat proyeksi `toKasirProduct`. */
export type MockProduct = Omit<Product, "units"> & {
  units: MockUnit[];
  category: string | null;
  status: ProductStatus;
  scarce: boolean;
  stockCounted: boolean;
  /** HPP: `amount` rupiah per `qtyBase` satuan dasar; null = belum diisi. */
  cost: ProductCost | null;
};
export type MockCostAlert = CostAlert;

/** Buku kasbon append-only: + kasbon, − pelunasan/batal. */
export type CreditEntry = {
  id: string;
  customerId: string;
  amount: number;
  at: number;
  saleId: string | null;
};

export type MockSupplier = Supplier & { lastUsedAt: number };

/**
 * Nota barang masuk. `id` = ID draf dari HP; replay hanya untuk pembuatnya
 * (R7: `id` milik `createdById` lain → 409 ID_TAKEN, nota tidak pernah dikembalikan).
 */
export type MockReceipt = {
  id: string;
  supplierId: string;
  notaDate: string;
  photoId: string | null;
  lines: ReceiptLine[];
  payment: ReceiptPayment;
  paid: DebtPayment | null;
  status: ReceiptStatus;
  createdById: string;
  createdByName: string;
  createdAt: number;
  editedByName: string | null;
  editedAt: number | null;
  cancelledAt: number | null;
};
export type MockAuditEntry = ReceiptAuditEntry & { receiptId: string };
/**
 * Ledger stok append-only selain penjualan; `qtyBase` bertanda (batal/koreksi turun/keluar = negatif).
 * `effectiveAt` = jam mutasi itu berlaku untuk stok pada jam t (K7): `at`, kecuali opname/stok awal
 * yang memakai jam hitungnya. Barang masuk & keluar kedaluwarsa dikunci ke baris nota (K9).
 */
export type MockStockEntry = {
  id: string;
  productId: string;
  at: number;
  effectiveAt: number;
  qtyBase: number;
  actorName: string;
  kind:
    | "masuk"
    | "koreksi_masuk"
    | "batal_masuk"
    | "opname"
    | "stok_awal"
    | "keluar_kedaluwarsa";
  receiptId: string | null;
  lineId: string | null;
  opnameId: string | null;
  reason: OpnameReason | null;
};

/** Satu barang di sesi opname; `value` (rupiah selisih) hanya untuk pemilik. */
export type MockOpnameItem = {
  productId: string;
  productName: string;
  unitName: string;
  unitSize: number;
  isCurah: boolean;
  countedQtyBase: number;
  countedAt: number;
  clockEstimated: boolean;
  systemQtyBase: number;
  diffQtyBase: number;
  value: number | null;
  state: OpnameItemState;
  reason: OpnameReason | null;
  receiptRefId: string | null;
  resolvedByName: string | null;
  resolvedAt: number | null;
  replacedBySessionId: string | null;
  /** Pembuat sesi pengganti; hanya bila barang ini ditahan saat diganti (tetap terlihat pemilik, I2). */
  replacedByName: string | null;
  /** I2: hitungan ini menggantikan hitungan tertahan milik pembuat yang sama → selalu ditahan. */
  mustHold: boolean;
  recount: {
    countedQtyBase: number;
    countedAt: number;
    systemQtyBase: number;
    diffQtyBase: number;
    value: number | null;
  } | null;
};
export type MockOpnameSession = {
  id: string;
  scope: OpnameScope;
  createdById: string;
  createdByName: string;
  submittedAt: number;
  finishedAt: number | null;
  status: "menunggu_alasan" | "selesai";
  flagged: boolean;
  reviewedByName: string | null;
  reviewedAt: number | null;
  items: MockOpnameItem[];
};
/**
 * Log kedaluwarsa; `lossValue` = nilai saat kejadian (K28), hanya untuk `keluar`. Nama & satuan
 * disalin saat kejadian agar log tetap terbaca setelah barangnya dihapus.
 */
export type MockExpiryEvent = {
  id: string;
  at: number;
  actorName: string;
  kind: "keluar" | "ubah_ed";
  productId: string;
  productName: string;
  unitName: string;
  unitSize: number;
  isCurah: boolean;
  receiptId: string;
  lineId: string;
  qtyBase: number | null;
  fromDate: string | null;
  toDate: string | null;
  lossValue: number | null;
};
/** Batas tetap di server (J8); layar pengaturannya di F3c. */
export type StockRules = {
  expirySoonDays: number;
  opnameItemLimit: number;
  opnameSessionLimit: number;
};

type LoginFailures = Record<
  string,
  { count: number; lockedUntil: number | null }
>;

export type MockState = {
  version: 6;
  store: { id: string; name: string };
  users: MockUser[];
  session: { userId: string } | null;
  pinFailures: LoginFailures;
  ownerSession: { userId: string } | null;
  ownerLoginFailures: LoginFailures;
  /** Realm HP orang toko: sesi dan kunci PIN sendiri, terpisah dari kasir (R9). */
  staffSession: { userId: string } | null;
  staffPinFailures: LoginFailures;
  shift: MockShift | null;
  closedShifts: MockClosedShift[];
  products: MockProduct[];
  categories: string[];
  /** Terlama dulu (append). */
  priceHistory: (PriceHistoryEntry & { productId: string })[];
  /** productId -> peringatan modal yang belum ditindaklanjuti pemilik. */
  costAlerts: Record<string, MockCostAlert>;
  /** productId -> qtyBase */
  stock: Record<string, number>;
  /** productId -> qtyBase; key tidak ada = tanpa batas. */
  minStock: Record<string, number>;
  sales: MockSale[];
  customers: Customer[];
  /** `customer.balance` selalu = Σ entri pelanggan itu. */
  creditLedger: CreditEntry[];
  settings: KasirSettings;
  /** "YYYYMMDD" -> urutan terakhir */
  saleSeq: Record<string, number>;
  suppliers: MockSupplier[];
  /** Hanya status, pelunasan, dan isi ubah yang berubah; tiga koleksi di bawahnya append-only. */
  receipts: MockReceipt[];
  receiptAudit: MockAuditEntry[];
  stockEntries: MockStockEntry[];
  /** Status, alasan, dan keputusan pemilik per barang berubah; daftar sesinya append. */
  opnameSessions: MockOpnameSession[];
  /** Append-only. */
  expiryLog: MockExpiryEvent[];
  stockRules: StockRules;
};

const STORAGE_KEY = "mock.db";

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/** Pemeriksaan struktur murah (bukan validasi mendalam). */
function isState(value: unknown): value is MockState {
  if (!isObj(value) || value.version !== 6) return false;
  const { store } = value;
  return (
    isObj(store) &&
    typeof store.id === "string" &&
    typeof store.name === "string" &&
    [
      "users",
      "closedShifts",
      "products",
      "categories",
      "priceHistory",
      "sales",
      "customers",
      "creditLedger",
      "suppliers",
      "receipts",
      "receiptAudit",
      "stockEntries",
      "opnameSessions",
      "expiryLog",
    ].every((k) => Array.isArray(value[k])) &&
    [
      "pinFailures",
      "ownerLoginFailures",
      "staffPinFailures",
      "stock",
      "minStock",
      "costAlerts",
      "settings",
      "saleSeq",
      "stockRules",
    ].every((k) => isObj(value[k])) &&
    ["session", "ownerSession", "staffSession", "shift"].every(
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
    mockPhotos.reset();
  },
};

/** Jalankan `fn` di dalam `mockDb.update` dan kembalikan hasilnya. */
export function updateWith<T>(fn: (s: MockState) => T): T {
  const out: T[] = [];
  mockDb.update((s) => {
    out.push(fn(s));
  });
  const [result] = out;
  if (result === undefined) throw new Error("State tidak diproses");
  return result;
}

/** Hanya untuk test: buang cache memori agar `get()` memuat ulang dari localStorage. */
export function __resetMockDbCacheForTests(): void {
  current = null;
}
