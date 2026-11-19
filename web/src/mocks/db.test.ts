import { describe, expect, test, vi } from "vitest";
import {
  __resetMockDbCacheForTests,
  customerNameOf,
  kasirVoidWindow,
  type MockSale,
  type MockShift,
  type MockState,
  mockDb,
  saleVoidOf,
  VOID_MAX_DAYS,
} from "./db";
import { mockPhotos } from "./photos";
import { rng } from "./seed";
import { createSeedState } from "./seed-data";
import { persistFailed, reportPersistSuccess } from "./storage-status";

test("mockDb persist dan reset", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.UTC(2026, 9, 23, 3));
  mockDb.update((s) => {
    s.store.name = "X";
  });
  expect(JSON.parse(localStorage.getItem("mock.db") ?? "{}").store.name).toBe(
    "X",
  );
  mockDb.reset();
  expect(mockDb.get()).toEqual(createSeedState());
});

test("JSON rusak di localStorage -> default tanpa melempar", () => {
  localStorage.setItem("mock.db", "{bukan json");
  __resetMockDbCacheForTests();
  expect(mockDb.get().store.name).toBe("ShaziaMart");
});

test("JSON bentuk valid v10 di localStorage dimuat lazy", () => {
  const stored: MockState = {
    ...createSeedState(),
    store: { id: "abc", name: "Toko Lain" },
  };
  localStorage.setItem("mock.db", JSON.stringify(stored));
  __resetMockDbCacheForTests();
  expect(mockDb.get().store).toEqual({ id: "abc", name: "Toko Lain" });
});

test("JSON bentuk salah -> default", () => {
  localStorage.setItem("mock.db", JSON.stringify({ version: 10, store: 1 }));
  __resetMockDbCacheForTests();
  expect(mockDb.get().store.name).toBe("ShaziaMart");
});

test("rng deterministik", () => {
  const a = rng(20261017);
  const b = rng(20261017);
  expect([a(), a(), a()]).toEqual([b(), b(), b()]);
});

test("mockDb.get mengembalikan salinan — mutasi tidak bocor", () => {
  mockDb.reset();
  const s = mockDb.get() as MockState;
  s.store.name = "X";
  expect(mockDb.get().store.name).toBe("ShaziaMart");
});

test("mockDb.get adalah snapshot — update sesudahnya tidak mengubahnya", () => {
  mockDb.reset();
  const before = mockDb.get();
  mockDb.update((s) => {
    s.store.name = "X";
    s.categories.push("Baru");
  });
  // Key dibaca setelah update: tetap isi saat `get` dipanggil.
  expect(before.store.name).toBe("ShaziaMart");
  expect(before.categories).not.toContain("Baru");
  expect(mockDb.get().store.name).toBe("X");
  expect(mockDb.get().categories).toContain("Baru");
});

test("update yang melempar tidak mengubah state maupun localStorage", () => {
  mockDb.reset();
  const stored = localStorage.getItem("mock.db");
  expect(() =>
    mockDb.update((s) => {
      s.store.name = "X";
      s.sales.length = 0;
      throw new Error("gagal");
    }),
  ).toThrow("gagal");
  expect(mockDb.get().store.name).toBe("ShaziaMart");
  expect(mockDb.get().sales.length).toBeGreaterThan(0);
  expect(localStorage.getItem("mock.db")).toBe(stored);
});

test("isi localStorage sama persis dengan JSON.stringify state setelah beberapa update", () => {
  mockDb.reset();
  mockDb.update((s) => {
    s.store.name = "X";
  });
  mockDb.update((s) => {
    s.sales = s.sales.slice(1);
    s.shift = null;
  });
  mockDb.update((s) => {
    s.categories.push("Baru");
  });
  const raw = localStorage.getItem("mock.db");
  expect(raw).toBe(JSON.stringify(mockDb.get()));
  expect(JSON.parse(raw ?? "{}")).toEqual(mockDb.get());
});

test("state v3 di localStorage → reseed v10", () => {
  const {
    categories: _c,
    priceHistory: _h,
    costAlerts: _a,
    ...rest
  } = createSeedState();
  const lama = { id: "v3", name: "Lama" };
  // Bentuk v3 asli (dengan unitCosts), dan bentuk lengkap tetapi bertanda versi 3.
  const v3 = { ...rest, version: 3, unitCosts: { x: 1000 } };
  for (const stored of [v3, { ...createSeedState(), version: 3 }]) {
    localStorage.setItem("mock.db", JSON.stringify({ ...stored, store: lama }));
    __resetMockDbCacheForTests();
    const s = mockDb.get();
    expect(s.version).toBe(10);
    expect(s.store.name).toBe("ShaziaMart");
    expect(s.categories).toHaveLength(20);
    expect(s).not.toHaveProperty("unitCosts");
    expect(s.products[0]).toMatchObject({ status: "aktif", scarce: false });
  }
});

test("state v4 di localStorage → reseed v10 dengan staffSession null dan koleksi nota kosong", () => {
  const {
    staffSession: _s,
    staffPinFailures: _f,
    suppliers: _sp,
    receipts: _r,
    receiptAudit: _a,
    stockEntries: _e,
    ...v4
  } = createSeedState();
  const lama = { id: "v4", name: "Lama" };
  // Bentuk v4 asli, dan bentuk lengkap tetapi bertanda versi 4.
  for (const stored of [
    { ...v4, version: 4 },
    { ...createSeedState(), version: 4 },
  ]) {
    localStorage.setItem("mock.db", JSON.stringify({ ...stored, store: lama }));
    __resetMockDbCacheForTests();
    const s = mockDb.get();
    expect(s.version).toBe(10);
    expect(s.store.name).toBe("ShaziaMart");
    expect([
      s.staffSession,
      s.staffPinFailures,
      s.suppliers,
      s.receipts,
      s.receiptAudit,
      s.stockEntries,
    ]).toEqual([null, {}, [], [], [], []]);
  }
});

test("state v5 di localStorage → reseed v10 dengan koleksi opname & kedaluwarsa kosong dan batas stok tetap", () => {
  const {
    opnameSessions: _o,
    expiryLog: _x,
    stockRules: _r,
    ...v5
  } = createSeedState();
  const lama = { id: "v5", name: "Lama" };
  // Bentuk v5 asli, dan bentuk lengkap tetapi bertanda versi 5.
  for (const stored of [
    { ...v5, version: 5 },
    { ...createSeedState(), version: 5 },
  ]) {
    localStorage.setItem("mock.db", JSON.stringify({ ...stored, store: lama }));
    __resetMockDbCacheForTests();
    const s = mockDb.get();
    expect(s.version).toBe(10);
    expect(s.store.name).toBe("ShaziaMart");
    expect([s.opnameSessions, s.expiryLog, s.stockRules]).toEqual([
      [],
      [],
      {
        expirySoonDays: 30,
        opnameItemLimit: 100_000,
        opnameSessionLimit: 250_000,
      },
    ]);
  }
});

test("state v6 di localStorage → seed v10 dengan rekaman pelunasan seed dan jam buka shift riwayat", () => {
  const { creditPayments: _p, ...rest } = createSeedState();
  const v6 = {
    ...rest,
    version: 6,
    creditLedger: rest.creditLedger.map(({ paymentId: _x, ...e }) => e),
    closedShifts: rest.closedShifts.map(({ openedAt: _o, ...c }) => c),
  };
  const lama = { id: "v6", name: "Lama" };
  // Bentuk v6 asli, dan bentuk lengkap tetapi bertanda versi 6.
  for (const stored of [v6, { ...createSeedState(), version: 6 }]) {
    localStorage.setItem("mock.db", JSON.stringify({ ...stored, store: lama }));
    __resetMockDbCacheForTests();
    const s = mockDb.get();
    expect(s.version).toBe(10);
    expect(s.store.name).toBe("ShaziaMart");
    expect(s.creditPayments.length).toBeGreaterThan(0);
    expect(s.creditLedger.every((e) => e.paymentId !== undefined)).toBe(true);
    expect(s.closedShifts.every((c) => c.openedAt < c.closedAt)).toBe(true);
  }
});

test("state v7 di localStorage → seed v10 dengan shiftId & data batal penjualan dan tinjau pengecualian kosong", () => {
  const seed = createSeedState();
  const v7 = {
    ...seed,
    version: 7,
    sales: seed.sales.map(
      ({
        shiftId: _s,
        voidedById: _i,
        voidedByName: _n,
        voidReason: _r,
        voidChannel: _c,
        voidRefund: _f,
        creditOverLimit: _o,
        ...sale
      }) => sale,
    ),
  };
  const { exceptionReviews: _e, ...v7Shape } = v7;
  const lama = { id: "v7", name: "Lama" };
  // Bentuk v7 asli, dan bentuk lengkap tetapi bertanda versi 7.
  for (const stored of [v7Shape, { ...seed, version: 7 }]) {
    localStorage.setItem("mock.db", JSON.stringify({ ...stored, store: lama }));
    __resetMockDbCacheForTests();
    const s = mockDb.get();
    expect(s.version).toBe(10);
    expect(s.store.name).toBe("ShaziaMart");
    // F3c-1 belum pernah ditinjau; (K20) jenis F3c-2a ditinjau sampai 2 hari sebelum seed.
    expect(s.exceptionReviews).toEqual({
      batal_transaksi: null,
      batal_pelunasan: null,
      kasbon_lewat_limit: null,
      batal_kas_keluar: expect.any(Number),
      selisih_kas: expect.any(Number),
      kas_keluar: expect.any(Number),
      serah_terima: expect.any(Number),
      shift_lama: expect.any(Number),
      selisih_kecil: null,
    });
    expect(s.sales.every((x) => typeof x.shiftId === "string")).toBe(true);
    expect(s.sales.every((x) => x.voidRefund === null)).toBe(true);
  }
});

test("(K24) state v8 di localStorage → seed v10 dengan lineCosts penjualan, catalogSince, dan reportRules", () => {
  const seed = createSeedState();
  const v8 = {
    ...seed,
    version: 8,
    sales: seed.sales.map(({ lineCosts: _l, ...sale }) => sale),
  };
  const { catalogSince: _c, reportRules: _r, ...v8Shape } = v8;
  const lama = { id: "v8", name: "Lama" };
  // Bentuk v8 asli, dan bentuk lengkap tetapi bertanda versi 8.
  for (const stored of [v8Shape, { ...seed, version: 8 }]) {
    localStorage.setItem("mock.db", JSON.stringify({ ...stored, store: lama }));
    __resetMockDbCacheForTests();
    const s = mockDb.get();
    expect(s.version).toBe(10);
    expect(s.store.name).toBe("ShaziaMart");
    expect(s.reportRules).toEqual({ thinMarginPermille: 100, unsoldDays: 30 });
    expect(typeof s.catalogSince).toBe("number");
    expect(s.sales.every((x) => x.lineCosts.length === x.items.length)).toBe(
      true,
    );
  }
});

test("(K16) state v9 di localStorage → seed v10 dengan laci F3c-2a, ambang Perlu perhatian, dan akun aktif", () => {
  const seed = createSeedState();
  const {
    drawerExpenses: _d,
    cashTakes: _t,
    qrisDays: _q,
    qrisSince: _s,
    storeProfile: _p,
    attentionRules: _a,
    defaultCreditLimit: _l,
    smallShortageReviews: _r,
    ...rest
  } = seed;
  const v9Shape = {
    ...rest,
    version: 9,
    users: seed.users.map(({ active: _x, ...u }) => u),
    settings: (({ ownerPhone: _o, ...k }) => k)(seed.settings),
    closedShifts: seed.closedShifts.map(
      ({
        kasirId: _k,
        expenses: _e,
        ownerTakes: _w,
        suggestedOpening: _g,
        openingNote: _n,
        ...c
      }) => c,
    ),
    exceptionReviews: {
      batal_transaksi: null,
      batal_pelunasan: null,
      kasbon_lewat_limit: null,
    },
  };
  const lama = { id: "v9", name: "Lama" };
  // Bentuk v9 asli, dan bentuk lengkap tetapi bertanda versi 9.
  for (const stored of [v9Shape, { ...seed, version: 9 }]) {
    localStorage.setItem("mock.db", JSON.stringify({ ...stored, store: lama }));
    __resetMockDbCacheForTests();
    const s = mockDb.get();
    expect(s.version).toBe(10);
    expect(s.store.name).toBe("ShaziaMart");
    expect(s.attentionRules).toEqual({
      cashDiffMin: 5_000,
      smallShortageWeekMax: 20_000,
      expenseSingleMax: 50_000,
      expenseShiftMax: 150_000,
      shiftMaxHours: 12,
      qrisDailyReconcile: true,
    });
    expect(s.defaultCreditLimit).toBe(500_000);
    expect(s.settings.ownerPhone).toBe("0812-3456-7890");
    expect(s.users.every((u) => u.active)).toBe(true);
    expect(s.closedShifts.every((c) => typeof c.kasirId === "string")).toBe(
      true,
    );
    expect(s.cashTakes.length).toBeGreaterThan(0);
    expect(Object.keys(s.exceptionReviews)).toHaveLength(9);
  }
});

test.each([
  ["opnameSessions", {}],
  ["expiryLog", null],
  ["stockRules", []],
  ["creditPayments", {}],
  ["exceptionReviews", []],
  ["reportRules", []],
  ["catalogSince", "2026-08-21"],
  ["drawerExpenses", {}],
  ["cashTakes", null],
  ["qrisDays", []],
  ["qrisSince", 0],
  ["storeProfile", "Jl. Kenanga"],
  ["attentionRules", []],
  ["smallShortageReviews", []],
  ["defaultCreditLimit", "500000"],
])("v10 dengan %s berbentuk salah → reseed", (key, bad) => {
  localStorage.setItem(
    "mock.db",
    JSON.stringify({
      ...createSeedState(),
      store: { id: "abc", name: "Toko Lain" },
      [key]: bad,
    }),
  );
  __resetMockDbCacheForTests();
  expect(mockDb.get().store.name).toBe("ShaziaMart");
});

test("staffSession objek atau null; bentuk lain → reseed", () => {
  const stored = {
    ...createSeedState(),
    store: { id: "abc", name: "Toko Lain" },
    staffSession: { userId: "u1" },
  };
  localStorage.setItem("mock.db", JSON.stringify(stored));
  __resetMockDbCacheForTests();
  expect(mockDb.get().staffSession).toEqual({ userId: "u1" });
  localStorage.setItem(
    "mock.db",
    JSON.stringify({ ...stored, staffSession: "u1" }),
  );
  __resetMockDbCacheForTests();
  expect(mockDb.get().store.name).toBe("ShaziaMart");
});

test.each([
  "categories",
  "priceHistory",
  "costAlerts",
  "minStock",
  "creditLedger",
  "ownerLoginFailures",
  "staffSession",
  "staffPinFailures",
  "suppliers",
  "receipts",
  "receiptAudit",
  "stockEntries",
  "opnameSessions",
  "expiryLog",
  "stockRules",
  "creditPayments",
  "exceptionReviews",
  "reportRules",
  "catalogSince",
  "drawerExpenses",
  "cashTakes",
  "qrisDays",
  "qrisSince",
  "storeProfile",
  "attentionRules",
  "smallShortageReviews",
  "defaultCreditLimit",
])("v10 tanpa %s → reseed", (key) => {
  const stored: Record<string, unknown> = {
    ...createSeedState(),
    store: { id: "abc", name: "Toko Lain" },
  };
  delete stored[key];
  localStorage.setItem("mock.db", JSON.stringify(stored));
  __resetMockDbCacheForTests();
  expect(mockDb.get().store.name).toBe("ShaziaMart");
});

// key null = localStorage.clear() di tab lain.
test.each(["mock.db", null])(
  "event storage key %s dari tab lain membuang cache",
  (key) => {
    mockDb.reset();
    expect(mockDb.get().store.name).toBe("ShaziaMart");
    const fromOtherTab: MockState = {
      ...createSeedState(),
      store: { id: "abc", name: "Tab Lain" },
    };
    localStorage.setItem("mock.db", JSON.stringify(fromOtherTab));
    window.dispatchEvent(new StorageEvent("storage", { key }));
    expect(mockDb.get().store.name).toBe("Tab Lain");
  },
);

test("event storage key lain tidak membuang cache", () => {
  mockDb.reset();
  localStorage.setItem(
    "mock.db",
    JSON.stringify({ ...createSeedState(), store: { id: "x", name: "Lain" } }),
  );
  window.dispatchEvent(new StorageEvent("storage", { key: "mock.skenario" }));
  expect(mockDb.get().store.name).toBe("ShaziaMart");
});

describe("(fix 1) saleVoidOf & customerNameOf", () => {
  const base = createSeedState(Date.UTC(2026, 10, 5, 3));
  const [sale] = base.sales;
  if (!sale) throw new Error("seed tanpa penjualan");

  test("penjualan aktif → null; batal lengkap → SaleVoid dari rekaman", () => {
    expect(saleVoidOf(sale)).toBeNull();
    const voided: MockSale = {
      ...sale,
      status: "dibatalkan",
      voidedAt: 5,
      voidedById: "u1",
      voidedByName: "Rina",
      voidReason: "salah",
      voidChannel: "kasir",
      voidRefund: { cash: 1, qris: 2, qrisSource: "laci", drawer: 3 },
    };
    expect(saleVoidOf(voided)).toEqual({
      at: 5,
      byId: "u1",
      byName: "Rina",
      reason: "salah",
      channel: "kasir",
      drawerRefund: 3,
      qrisRefundSource: "laci",
    });
  });

  test.each([
    "voidedById",
    "voidedByName",
    "voidReason",
    "voidChannel",
    "voidRefund",
  ] as const)(
    "batal tanpa %s → melempar (invarian, bukan nilai karangan)",
    (key) => {
      const broken: MockSale = {
        ...sale,
        status: "dibatalkan",
        voidedAt: 5,
        voidedById: "u1",
        voidedByName: "Rina",
        voidReason: "salah",
        voidChannel: "kasir",
        voidRefund: { cash: 0, qris: 0, qrisSource: null, drawer: 0 },
        [key]: null,
      };
      expect(() => saleVoidOf(broken)).toThrow(/tidak lengkap/);
    },
  );

  test("status dibatalkan tanpa voidedAt → melempar", () => {
    expect(() => saleVoidOf({ ...sale, status: "dibatalkan" })).toThrow(
      /tidak lengkap/,
    );
  });

  test("customerNameOf: nama atau null", () => {
    const sari = base.customers.find((c) => c.name === "Bu Sari");
    expect(customerNameOf(base, sari?.id ?? "")).toBe("Bu Sari");
    expect(customerNameOf(base, null)).toBeNull();
    expect(customerNameOf(base, "tidak-ada")).toBeNull();
  });
});

describe("kasirVoidWindow (ruling R12, K28: hari kalender WIB)", () => {
  const shift = { id: "buka" } as MockShift;
  const sale = (createdAt: number, shiftId = "lama") =>
    ({ createdAt, shiftId }) as MockSale;
  /** Jam dinding WIB → epoch UTC. */
  const wib = (y: number, m: number, d: number, h: number, min = 0) =>
    Date.UTC(y, m - 1, d, h - 7, min);

  test("penjualan shift yang buka → shift_ini, berapa pun umurnya", () => {
    expect(kasirVoidWindow(sale(0, "buka"), shift, wib(2026, 11, 5, 12))).toBe(
      "shift_ini",
    );
  });

  test("tepi pertama: now Kamis 5 Nov 23.59 → 29 Okt 00.00 boleh, 28 Okt 23.59 terlalu lama", () => {
    const now = wib(2026, 11, 5, 23, 59);
    expect(VOID_MAX_DAYS).toBe(7);
    expect(kasirVoidWindow(sale(wib(2026, 10, 29, 0)), shift, now)).toBe(
      "shift_lama",
    );
    expect(kasirVoidWindow(sale(wib(2026, 10, 28, 23, 59)), shift, now)).toBe(
      "terlalu_lama",
    );
  });

  test("tepi kedua: now Jumat 6 Nov 00.00 → 29 Okt 00.00 terlalu lama, 30 Okt boleh; tanpa shift tetap menilai umur", () => {
    const now = wib(2026, 11, 6, 0);
    expect(kasirVoidWindow(sale(wib(2026, 10, 29, 0)), shift, now)).toBe(
      "terlalu_lama",
    );
    expect(kasirVoidWindow(sale(wib(2026, 10, 30, 0)), null, now)).toBe(
      "shift_lama",
    );
  });
});

describe("kuota localStorage penuh", () => {
  const WARNING =
    'Penyimpanan data contoh penuh — data terbaru tidak tersimpan. Pakai "Reset data" di panel pengembang.';
  const full = () =>
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("penuh", "QuotaExceededError");
    });

  test("setItem gagal: peringatan sekali, flag true; berhasil lagi: flag false", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const setItem = full();
    try {
      mockDb.update((s) => {
        s.store.name = "A";
      });
      mockDb.update((s) => {
        s.store.name = "B";
      });
      expect(persistFailed()).toBe(true);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(WARNING);
      expect(mockDb.get().store.name).toBe("B");
      setItem.mockRestore();
      mockDb.update((s) => {
        s.store.name = "C";
      });
      expect(persistFailed()).toBe(false);
    } finally {
      setItem.mockRestore();
      warn.mockRestore();
      reportPersistSuccess();
    }
  });

  test("jalur normal: tanpa peringatan, flag false", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      mockDb.update((s) => {
        s.store.name = "N";
      });
      expect(persistFailed()).toBe(false);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  test("foto: setItem gagal ikut memberi peringatan", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const setItem = full();
    try {
      mockPhotos.save("p1", "u1", new Uint8Array([1]));
      expect(persistFailed()).toBe(true);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      setItem.mockRestore();
      warn.mockRestore();
      reportPersistSuccess();
    }
  });
});
