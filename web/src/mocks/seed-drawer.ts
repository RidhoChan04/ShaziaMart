import {
  addIsoDays,
  type BusinessDay,
  DAY_MS,
  daysBefore,
  HOUR_MS,
  isoDaysBetween,
  jakartaIsoDate,
} from "@/shared/lib/business-day";
import type {
  MockCashTake,
  MockDrawerExpense,
  MockQrisDay,
  MockState,
  MockUser,
} from "./db";
import { KIND, makeId, rng } from "./seed";

/**
 * Contoh seed F3c-2a untuk laci riwayat: serah terima modal, kas keluar, ambil uang pemilik, dan
 * tanda QRIS harian. (K17) Setiap shift riwayat ditutup lalu pemilik menyetor `countedCash −
 * 200.000` (pengambilan di sela shift, terpakai shift berikutnya), sehingga saran modal seed =
 * Rp200.000. (K20) Contoh yang harus tampil di Perlu perhatian berada di 2 hari terakhir, setelah
 * penanda tinjau seed (`now − 2 hari`).
 */
export const SEED_OPENING_CASH = 200_000;

type KasirName = "Rina" | "Budi";
const DRAWER_SEED = 0xd2a3e1;
const MINUTE_MS = 60_000;
/** (S6) Selisih kecil berulang Rina: hari-ke-belakang 1..6 masing-masing −4.000 (Σ −24.000). */
const SMALL_SHORTAGE = -4_000;
const SMALL_SHORTAGE_BACK = 6;
/** (S3) Shift Budi hari-ke-belakang 2 buka 13.00, tutup 02.00 besoknya (13 jam). */
const LONG_SHIFT = { back: 2, kasir: "Budi", hours: 13 } as const;
/** (S4) Serah terima: Rina kemarin membuka dengan modal Rp10.000 di bawah saran. */
const OPENING_NOTE = {
  back: 1,
  kasir: "Rina",
  delta: -10_000,
  note: "Salah hitung kemarin",
} as const;
/** (S2) Kas keluar besar satuan (> Rp50.000) dan satu shift Σ Rp160.000 (> Rp150.000), kemarin. */
const BIG_EXPENSE = {
  back: 1,
  kasir: "Rina",
  hour: 9.5,
  amount: 75_000,
  reason: "Beli gas elpiji dan air galon",
} as const;
const SHIFT_EXPENSES = {
  back: 1,
  kasir: "Budi",
  items: [
    [14, 40_000, "Beli token listrik"],
    [16, 40_000, "Bayar iuran sampah"],
    [18, 40_000, "Beli lakban dan kantong plastik"],
    [20, 40_000, "Ongkos angkut galon"],
  ],
} as const;
/** (S5) Satu pengambilan pemilik di dalam shift yang sudah tutup. */
const TAKE_IN_SHIFT = {
  back: 2,
  kasir: "Rina",
  hour: 11,
  max: 100_000,
  note: "Untuk belanja stok",
} as const;
/** Kas keluar kecil (≤ Rp20.000) di sebagian shift lama, dua per shift. */
const SMALL_EXPENSE_SHARE = 0.3;
const SMALL_EXPENSE_REASONS = [
  "Beli es batu",
  "Beli kantong plastik",
  "Bayar parkir",
  "Beli air galon",
  "Uang kebersihan",
  "Beli sabun cuci",
];
const HANDOVER_NOTE = "Setoran harian";

export type DrawerSeed = {
  rand: () => number;
  owner: MockUser;
  kasir: Readonly<Record<KasirName, MockUser>>;
  /** Uang fisik shift tutup sebelumnya (null sebelum shift pertama). */
  prevCounted: number | null;
  /** Pengambilan sela yang belum terpakai shift berikutnya. */
  pendingTake: MockCashTake | null;
};

export function createDrawerSeed(
  state: Readonly<MockState>,
  today: BusinessDay,
): DrawerSeed {
  const byName = (name: string) => {
    const user = state.users.find((u) => u.name === name);
    if (!user) throw new Error(`Seed tanpa ${name}`);
    return user;
  };
  const owner = state.users.find((u) => u.role === "pemilik");
  if (!owner) throw new Error("Seed tanpa pemilik");
  return {
    rand: rng(DRAWER_SEED ^ Number(today.key)),
    owner,
    kasir: { Rina: byName("Rina"), Budi: byName("Budi") },
    prevCounted: null,
    pendingTake: null,
  };
}

/** Jam tutup shift riwayat: 5 menit setelah jam tutup, kecuali contoh shift kelamaan (S3). */
export function seedClosedAt(
  back: number,
  kasirName: KasirName,
  openedAt: number,
  day: BusinessDay,
  closeHour: number,
): number {
  if (back === LONG_SHIFT.back && kasirName === LONG_SHIFT.kasir) {
    return openedAt + LONG_SHIFT.hours * HOUR_MS;
  }
  return day.start + closeHour * HOUR_MS + 5 * MINUTE_MS;
}

/**
 * (K8, K17) Buka shift riwayat: saran = uang fisik shift sebelumnya − setoran sela; modal = saran,
 * kecuali contoh serah terima (S4). Setoran sela ditandai terpakai shift ini.
 */
export function openSeedShift(
  seed: DrawerSeed,
  back: number,
  kasirName: KasirName,
  shiftId: string,
): {
  openingCash: number;
  suggestedOpening: number | null;
  openingNote: string | null;
} {
  const take = seed.pendingTake;
  const suggestedOpening =
    seed.prevCounted === null
      ? null
      : Math.max(0, seed.prevCounted - (take?.amount ?? 0));
  if (take) take.consumedByShiftId = shiftId;
  seed.pendingTake = null;
  if (suggestedOpening === null) {
    return {
      openingCash: SEED_OPENING_CASH,
      suggestedOpening,
      openingNote: null,
    };
  }
  if (back === OPENING_NOTE.back && kasirName === OPENING_NOTE.kasir) {
    return {
      openingCash: Math.max(0, suggestedOpening + OPENING_NOTE.delta),
      suggestedOpening,
      openingNote: OPENING_NOTE.note,
    };
  }
  return { openingCash: suggestedOpening, suggestedOpening, openingNote: null };
}

/** (S6) Selisih contoh yang menggantikan selisih acak; null = pakai selisih acak. */
export const seedDifference = (back: number, kasirName: KasirName) =>
  kasirName === "Rina" && back <= SMALL_SHORTAGE_BACK ? SMALL_SHORTAGE : null;

type ShiftWindow = {
  back: number;
  day: BusinessDay;
  kasirName: KasirName;
  shiftId: string;
  openedAt: number;
  closedAt: number;
  /** Uang tunai laci sebelum kas keluar & ambil uang (modal + penjualan tunai). */
  cashBefore: number;
};

/** Kas keluar shift ini (append ke state), urut jam. */
function seedExpenses(
  state: MockState,
  seed: DrawerSeed,
  w: ShiftWindow,
): MockDrawerExpense[] {
  const plan: [at: number, amount: number, reason: string][] = [];
  if (w.back === BIG_EXPENSE.back && w.kasirName === BIG_EXPENSE.kasir) {
    plan.push([
      w.day.start + BIG_EXPENSE.hour * HOUR_MS,
      BIG_EXPENSE.amount,
      BIG_EXPENSE.reason,
    ]);
  } else if (
    w.back === SHIFT_EXPENSES.back &&
    w.kasirName === SHIFT_EXPENSES.kasir
  ) {
    for (const [hour, amount, reason] of SHIFT_EXPENSES.items) {
      plan.push([w.day.start + hour * HOUR_MS, amount, reason]);
    }
  } else if (w.back > 2 && seed.rand() < SMALL_EXPENSE_SHARE) {
    const span = w.closedAt - w.openedAt - HOUR_MS;
    for (let i = 0; i < 2; i++) {
      const at =
        w.openedAt +
        30 * MINUTE_MS +
        Math.floor(seed.rand() * (span / MINUTE_MS)) * MINUTE_MS;
      const amount = (5 + Math.floor(seed.rand() * 16)) * 1_000;
      const reason =
        SMALL_EXPENSE_REASONS[
          Math.floor(seed.rand() * SMALL_EXPENSE_REASONS.length)
        ] ?? "Beli es batu";
      plan.push([at, amount, reason]);
    }
  }
  const kasir = seed.kasir[w.kasirName];
  const rows = plan
    .sort((a, b) => a[0] - b[0])
    .map(
      ([at, amount, reason], i): MockDrawerExpense => ({
        id: makeId(KIND.expense, state.drawerExpenses.length + i + 1),
        at,
        amount,
        reason,
        shiftId: w.shiftId,
        createdById: kasir.id,
        createdByName: kasir.name,
        cancelledAt: null,
        cancelledById: null,
        cancelledByName: null,
        cancelledChannel: null,
        cancelReason: null,
      }),
    );
  state.drawerExpenses.push(...rows);
  return rows;
}

const newTake = (
  state: MockState,
  seed: DrawerSeed,
  take: Pick<MockCashTake, "at" | "amount" | "note" | "shiftId">,
): MockCashTake => ({
  id: makeId(KIND.cashTake, state.cashTakes.length + 1),
  ...take,
  createdById: seed.owner.id,
  createdByName: seed.owner.name,
  consumedByShiftId: null,
  cancelledAt: null,
  cancelledById: null,
  cancelledByName: null,
  cancelReason: null,
});

/**
 * Kas keluar dan pengambilan pemilik di dalam shift ini (append ke state). Hasil = Σ untuk
 * `ShiftClosure.expenses` dan `ShiftClosure.ownerTakes`.
 */
export function seedShiftCash(
  state: MockState,
  seed: DrawerSeed,
  w: ShiftWindow,
): { expenses: number; ownerTakes: number } {
  const expenses = seedExpenses(state, seed, w).reduce(
    (sum, e) => sum + e.amount,
    0,
  );
  let ownerTakes = 0;
  if (w.back === TAKE_IN_SHIFT.back && w.kasirName === TAKE_IN_SHIFT.kasir) {
    // Paling banyak separuh uang tunai di atas modal, agar setoran sela sesudahnya tetap ada.
    const spare = w.cashBefore - expenses - SEED_OPENING_CASH;
    const amount = Math.min(
      TAKE_IN_SHIFT.max,
      Math.floor(spare / 2 / 10_000) * 10_000,
    );
    if (amount >= 10_000) {
      state.cashTakes.push(
        newTake(state, seed, {
          at: w.day.start + TAKE_IN_SHIFT.hour * HOUR_MS,
          amount,
          note: TAKE_IN_SHIFT.note,
          shiftId: w.shiftId,
        }),
      );
      ownerTakes = amount;
    }
  }
  return { expenses, ownerTakes };
}

/**
 * (K17) Setelah shift tutup: pemilik menyetor `countedCash − 200.000` dari laci (di sela shift,
 * terpakai shift berikutnya; yang terakhir belum terpakai). Shift riwayat Rina 06.00–13.05 dan
 * Budi 13.00–21.05 tumpang 5 menit: setoran sela dicatat tepat di jam tutup.
 */
export function closeSeedShift(
  state: MockState,
  seed: DrawerSeed,
  countedCash: number,
  closedAt: number,
): void {
  seed.prevCounted = countedCash;
  const amount = countedCash - SEED_OPENING_CASH;
  if (amount < 1) {
    seed.pendingTake = null;
    return;
  }
  const take = newTake(state, seed, {
    at: closedAt,
    amount,
    note: HANDOVER_NOTE,
    shiftId: null,
  });
  state.cashTakes.push(take);
  seed.pendingTake = take;
}

/**
 * (K11) QRIS harian mulai dihitung 3 hari sebelum hari seed; hari sebelumnya yang ber-QRIS sudah
 * ditandai `cocok` oleh pemilik (dengan total saat ditandai, K21) agar Beranda contoh tidak penuh.
 */
export function seedQrisDays(
  state: MockState,
  today: BusinessDay,
  owner: MockUser,
): void {
  state.qrisSince = addIsoDays(today.date, -3);
  const totals = new Map<string, number>();
  for (const sale of state.sales) {
    if (sale.status === "dibatalkan") continue;
    const qris = sale.payments
      .filter((p) => p.method === "qris")
      .reduce((sum, p) => sum + p.amount, 0);
    if (qris === 0) continue;
    const date = jakartaIsoDate(sale.createdAt);
    totals.set(date, (totals.get(date) ?? 0) + qris);
  }
  const days: Record<string, MockQrisDay> = {};
  for (const [date, total] of [...totals].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (date >= state.qrisSince) continue;
    days[date] = {
      date,
      status: "cocok",
      note: null,
      markedById: owner.id,
      markedByName: owner.name,
      // Ditandai pukul 20.00 keesokan harinya.
      markedAt:
        daysBefore(today, isoDaysBetween(date, today.date)).start +
        DAY_MS +
        20 * HOUR_MS,
      markedTotal: total,
    };
  }
  state.qrisDays = days;
}
