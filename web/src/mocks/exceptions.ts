import type {
  AttentionRules,
  CashierException,
  ExceptionAttention,
  ExceptionKind,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  isCashDiffEvent,
  isLargeExpense,
  isSmallShortage,
  longShiftAt,
  shiftExpenseCrossing,
} from "@/shared/lib/attention-rules";
import { DAY_MS, jakartaIsoDate } from "@/shared/lib/business-day";
import {
  customerNameOf,
  type MockDrawerExpense,
  type MockSale,
  type MockState,
  saleVoidOf,
} from "./db";

/** (K29, K2 F3c-2a) Urutan tetap butir Perlu perhatian. */
export const EXCEPTION_KINDS: readonly ExceptionKind[] = [
  "batal_transaksi",
  "batal_pelunasan",
  "kasbon_lewat_limit",
  "batal_kas_keluar",
  "selisih_kas",
  "kas_keluar",
  "serah_terima",
  "shift_lama",
  "selisih_kecil",
];

/** Kejadian sebelum jam buka/tutup shiftnya dipasang (di `cashierExceptions`). */
type ExceptionEvent = Omit<CashierException, "shiftOpenedAt" | "shiftClosedAt">;

/** Id kasir shift penjualan (buka atau tutup); null bila tidak dikenal. */
const shiftKasirId = (
  state: Readonly<MockState>,
  shiftId: string,
): string | null =>
  state.shift?.id === shiftId
    ? state.shift.kasirId
    : (state.closedShifts.find((c) => c.shiftId === shiftId)?.kasirId ?? null);

/** Penjualan dari shift yang sudah tutup saat dibatalkan (ruling R12). */
const fromClosedShift = (state: Readonly<MockState>, s: MockSale): boolean =>
  state.closedShifts.some(
    (c) => c.shiftId === s.shiftId && c.closedAt <= (s.voidedAt ?? 0),
  );

function saleBased(
  state: Readonly<MockState>,
  s: MockSale,
  kind: ExceptionKind,
): ExceptionEvent {
  const base = {
    id: s.id,
    kind,
    customerName: customerNameOf(state, s.customerId),
    saleId: s.id,
    saleNumber: s.number,
    paymentId: null,
    shiftId: null,
    durationMinutes: null,
    overLimitExcess: null,
  };
  if (kind === "kasbon_lewat_limit") {
    const over = s.creditOverLimit;
    if (over === null)
      throw new Error(`Penjualan ${s.id} tanpa kasbon lewat limit`);
    return {
      ...base,
      at: s.createdAt,
      kasirId: shiftKasirId(state, s.shiftId),
      kasirName: s.kasirName,
      amount: over.excess,
      reason: over.reason,
      fromClosedShift: false,
      refund: 0,
      qrisToOwner: 0,
    };
  }
  const voided = saleVoidOf(s);
  const r = s.voidRefund;
  if (voided === null || r === null) {
    throw new Error(`Penjualan ${s.id} belum dibatalkan`);
  }
  return {
    ...base,
    at: voided.at,
    kasirId: voided.byId,
    kasirName: voided.byName,
    amount: s.total,
    reason: voided.reason,
    fromClosedShift: fromClosedShift(state, s),
    refund: r.drawer,
    qrisToOwner: r.qrisSource === "pemilik" ? r.qris : 0,
    overLimitExcess: s.creditOverLimit?.excess ?? null,
  };
}

/** (K6) Jendela selisih kecil berulang per kasir. */
const SMALL_SHORTAGE_WINDOW_MS = 7 * DAY_MS;
const MINUTE_MS = 60_000;
/** (K4) Id kejadian kas keluar per shift: `kas_keluar_shift-{shiftId}`. */
const SHIFT_EXPENSE_PREFIX = "kas_keluar_shift-";

/** Kolom penjualan/pelunasan (jenis F3c-1); selalu kosong untuk jenis F3c-2a. */
const NO_SALE = {
  customerName: null,
  saleId: null,
  saleNumber: null,
  paymentId: null,
  fromClosedShift: false,
  refund: 0,
  qrisToOwner: 0,
  overLimitExcess: null,
} as const;

/** Shift tutup atau buka dalam satu bentuk untuk aturan kejadian (closedAt null = masih buka). */
type ShiftView = {
  id: string;
  kasirId: string;
  kasirName: string;
  openedAt: number;
  closedAt: number | null;
  openingCash: number;
  suggestedOpening: number | null;
  openingNote: string | null;
};

function shiftViews(state: Readonly<MockState>): ShiftView[] {
  const views: ShiftView[] = state.closedShifts.map((c) => ({
    id: c.shiftId,
    kasirId: c.kasirId,
    kasirName: c.kasirName,
    openedAt: c.openedAt,
    closedAt: c.closedAt,
    openingCash: c.openingCash,
    suggestedOpening: c.suggestedOpening,
    openingNote: c.openingNote,
  }));
  const open = state.shift;
  if (open) {
    views.push({
      id: open.id,
      kasirId: open.kasirId,
      kasirName: open.kasirName,
      openedAt: open.openedAt,
      closedAt: null,
      openingCash: open.openingCash,
      suggestedOpening: open.suggestedOpening,
      openingNote: open.openingNote,
    });
  }
  return views;
}

/** Kejadian satu shift (id = shiftId, pelaku = kasir shift). */
const shiftEvent = (
  shift: Pick<ShiftView, "id" | "kasirId" | "kasirName">,
  kind: ExceptionKind,
  at: number,
  amount: number,
  extra: Partial<Pick<CashierException, "reason" | "durationMinutes">> = {},
): ExceptionEvent => ({
  id: shift.id,
  kind,
  at,
  kasirId: shift.kasirId,
  kasirName: shift.kasirName,
  amount,
  reason: null,
  shiftId: shift.id,
  durationMinutes: null,
  ...NO_SALE,
  ...extra,
});

/** Kas keluar aktif (S10: yang dibatalkan tidak ikut kejadian maupun Σ shift). */
const activeExpenses = (state: Readonly<MockState>): MockDrawerExpense[] =>
  state.drawerExpenses.filter((e) => e.cancelledAt === null);

const sumAmounts = (rows: readonly { amount: number }[]): number =>
  rows.reduce((sum, r) => sum + r.amount, 0);

/** (K4) Kas keluar besar: (a) satuan > expenseSingleMax, (b) satu per shift bila Σ > expenseShiftMax. */
function largeExpenseEvents(
  state: Readonly<MockState>,
  rules: AttentionRules,
): ExceptionEvent[] {
  const shifts = new Map(shiftViews(state).map((v) => [v.id, v]));
  // Pelaku = kasir shift; kas keluar dari shift yang tidak dikenal memakai pencatatnya.
  const kasirOf = (e: MockDrawerExpense) => {
    const shift = shifts.get(e.shiftId);
    return shift
      ? { kasirId: shift.kasirId, kasirName: shift.kasirName }
      : { kasirId: e.createdById, kasirName: e.createdByName };
  };
  const active = activeExpenses(state);
  const single = active
    .filter((e) => isLargeExpense(e.amount, rules))
    .map(
      (e): ExceptionEvent => ({
        id: e.id,
        kind: "kas_keluar",
        at: e.at,
        ...kasirOf(e),
        amount: e.amount,
        reason: e.reason,
        shiftId: e.shiftId,
        durationMinutes: null,
        ...NO_SALE,
      }),
    );
  const byShift = new Map<string, MockDrawerExpense[]>();
  for (const e of active) {
    byShift.set(e.shiftId, [...(byShift.get(e.shiftId) ?? []), e]);
  }
  const perShift = [...byShift].flatMap(([shiftId, rows]): ExceptionEvent[] => {
    const at = shiftExpenseCrossing(rows, rules);
    const [first] = rows;
    if (at === null || !first) return [];
    return [
      {
        id: `${SHIFT_EXPENSE_PREFIX}${shiftId}`,
        kind: "kas_keluar",
        at,
        ...kasirOf(first),
        amount: sumAmounts(rows),
        reason: null,
        shiftId,
        durationMinutes: null,
        ...NO_SALE,
      },
    ];
  });
  return [...single, ...perShift];
}

/**
 * (K22) Total butir kas_keluar = Σ kas keluar aktif unik yang tercakup kejadiannya: kejadian satuan
 * mencakup dirinya, kejadian shift mencakup semua kas keluar aktif shift itu.
 */
function coveredExpenseTotal(
  state: Readonly<MockState>,
  events: readonly CashierException[],
): number {
  const ids = new Set(events.map((e) => e.id));
  const shiftIds = new Set(
    events
      .filter((e) => e.id.startsWith(SHIFT_EXPENSE_PREFIX))
      .map((e) => e.shiftId),
  );
  return sumAmounts(
    activeExpenses(state).filter(
      (e) => ids.has(e.id) || shiftIds.has(e.shiftId),
    ),
  );
}

function eventsOf(
  state: Readonly<MockState>,
  kind: ExceptionKind,
  now: number,
): ExceptionEvent[] {
  const rules = state.attentionRules;
  switch (kind) {
    case "batal_transaksi":
      return state.sales
        .filter((s) => s.voidChannel === "kasir")
        .map((s) => saleBased(state, s, kind));
    case "kasbon_lewat_limit":
      return state.sales
        .filter((s) => s.creditOverLimit !== null && s.status !== "dibatalkan")
        .map((s) => saleBased(state, s, kind));
    case "batal_pelunasan":
      return state.creditPayments
        .filter((p) => p.cancelledChannel === "kasir")
        .map(
          (p): ExceptionEvent => ({
            id: p.id,
            kind,
            at: p.cancelledAt ?? p.at,
            kasirId: p.cancelledById,
            kasirName: p.cancelledByName ?? "",
            amount: p.amount,
            reason: p.cancelReason ?? "",
            customerName: customerNameOf(state, p.customerId),
            saleId: null,
            saleNumber: null,
            paymentId: p.id,
            shiftId: null,
            durationMinutes: null,
            fromClosedShift: false,
            refund: 0,
            qrisToOwner: 0,
            overLimitExcess: null,
          }),
        );
    case "batal_kas_keluar":
      return state.drawerExpenses
        .filter((e) => e.cancelledChannel === "kasir")
        .map(
          (e): ExceptionEvent => ({
            id: e.id,
            kind,
            at: e.cancelledAt ?? e.at,
            kasirId: e.cancelledById,
            kasirName: e.cancelledByName ?? "",
            amount: e.amount,
            reason: e.cancelReason ?? "",
            shiftId: e.shiftId,
            durationMinutes: null,
            ...NO_SALE,
          }),
        );
    case "selisih_kas":
      return state.closedShifts
        .filter((c) => isCashDiffEvent(c.difference, rules))
        .map((c) =>
          shiftEvent(
            { id: c.shiftId, kasirId: c.kasirId, kasirName: c.kasirName },
            kind,
            c.closedAt,
            c.difference,
          ),
        );
    case "kas_keluar":
      return largeExpenseEvents(state, rules);
    case "serah_terima":
      return shiftViews(state).flatMap((v) =>
        v.suggestedOpening === null || v.openingCash === v.suggestedOpening
          ? []
          : [
              shiftEvent(
                v,
                kind,
                v.openedAt,
                v.openingCash - v.suggestedOpening,
                {
                  reason: v.openingNote,
                },
              ),
            ],
      );
    case "shift_lama":
      return shiftViews(state).flatMap((v) => {
        const end = v.closedAt ?? now;
        const at = longShiftAt(v.openedAt, end, rules);
        if (at === null) return [];
        return [
          shiftEvent(v, kind, at, 0, {
            durationMinutes: Math.floor((end - v.openedAt) / MINUTE_MS),
          }),
        ];
      });
    case "selisih_kecil":
      return state.closedShifts
        .filter(
          (c) =>
            isSmallShortage(c.difference, rules) &&
            c.closedAt > now - SMALL_SHORTAGE_WINDOW_MS,
        )
        .map((c) =>
          shiftEvent(
            { id: c.shiftId, kasirId: c.kasirId, kasirName: c.kasirName },
            kind,
            c.closedAt,
            c.difference,
          ),
        );
  }
}

/**
 * Kejadian Perlu perhatian satu jenis (K29, K2–K7, K22), terbaru dulu — tampilan turunan dari
 * rekaman yang menyimpan pelaku/alasan, dihitung dengan ambang `attentionRules` saat ini (K7). Semua
 * umur kecuali selisih_kecil (7 hari sebelum `now`); shift_lama shift buka diukur sampai `now`.
 * Pembatalan oleh pemilik sendiri bukan kejadian. shiftOpenedAt/shiftClosedAt dari rekaman shift
 * (tutup atau yang sedang buka); null bila tanpa shift atau shift tidak dikenal.
 */
export function cashierExceptions(
  state: Readonly<MockState>,
  kind: ExceptionKind,
  now: number,
): CashierException[] {
  const shifts = new Map(shiftViews(state).map((v) => [v.id, v]));
  // Dibalik dulu agar kejadian dengan jam sama tetap terbaru (tercatat belakangan) dulu.
  return eventsOf(state, kind, now)
    .reverse()
    .sort((a, b) => b.at - a.at)
    .map((e) => {
      const shift = e.shiftId === null ? undefined : shifts.get(e.shiftId);
      return {
        ...e,
        shiftOpenedAt: shift?.openedAt ?? null,
        shiftClosedAt: shift?.closedAt ?? null,
      };
    });
}

/** Terakhir ditinjau; selisih_kecil memakai penanda per kasir (K18), null tanpa kasir. */
export function reviewedAtOf(
  state: Readonly<MockState>,
  kind: ExceptionKind,
  kasirId: string | null,
): number | null {
  if (kind !== "selisih_kecil") return state.exceptionReviews[kind];
  return kasirId === null
    ? null
    : (state.smallShortageReviews[kasirId] ?? null);
}

/**
 * Kejadian yang belum ditinjau: `at > reviewedAt` (semua bila belum pernah). selisih_kecil hanya
 * milik `kasirId`.
 */
export function unreviewed(
  state: Readonly<MockState>,
  kind: ExceptionKind,
  now: number,
  kasirId: string | null = null,
): CashierException[] {
  const reviewedAt = reviewedAtOf(state, kind, kasirId);
  return cashierExceptions(state, kind, now).filter(
    (e) =>
      (kind !== "selisih_kecil" || e.kasirId === kasirId) &&
      (reviewedAt === null || e.at > reviewedAt),
  );
}

function attentionOf(
  state: Readonly<MockState>,
  kind: ExceptionKind,
  items: readonly CashierException[],
  kasir: { id: string; name: string } | null,
): ExceptionAttention[] {
  const newest = items[0];
  const oldest = items.at(-1);
  if (!newest || !oldest) return [];
  return [
    {
      kind,
      count: items.length,
      total:
        kind === "kas_keluar"
          ? coveredExpenseTotal(state, items)
          : sumAmounts(items),
      shortage: items.reduce((sum, e) => sum + Math.min(e.amount, 0), 0),
      from: jakartaIsoDate(oldest.at),
      to: jakartaIsoDate(newest.at),
      latestAt: newest.at,
      kasirId: kasir?.id ?? null,
      kasirName: kasir?.name ?? null,
      longestMinutes:
        kind === "shift_lama"
          ? Math.max(...items.map((e) => e.durationMinutes ?? 0))
          : null,
    },
  ];
}

/**
 * (K6, K18) Selisih kecil berulang: satu butir per kasir (dikelompokkan kasirId, nama = nama akun
 * sekarang) bila Σ |selisih kurang kecil| 7 hari terakhir yang belum ditinjau > smallShortageWeekMax;
 * urut nama.
 */
function smallShortageAttention(
  state: Readonly<MockState>,
  now: number,
): ExceptionAttention[] {
  const kasirIds = new Set(
    cashierExceptions(state, "selisih_kecil", now).flatMap((e) =>
      e.kasirId === null ? [] : [e.kasirId],
    ),
  );
  return [...kasirIds]
    .flatMap((id) => {
      const items = unreviewed(state, "selisih_kecil", now, id);
      const short = -sumAmounts(items);
      if (short <= state.attentionRules.smallShortageWeekMax) return [];
      const name =
        state.users.find((u) => u.id === id)?.name ?? items[0]?.kasirName ?? "";
      return attentionOf(state, "selisih_kecil", items, { id, name });
    })
    .sort(
      (a, b) =>
        (a.kasirName ?? "").localeCompare(b.kasirName ?? "", "id") ||
        (a.kasirId ?? "").localeCompare(b.kasirId ?? ""),
    );
}

/**
 * Butir Perlu perhatian (ruling R9, K2): menumpuk sejak ditinjau, hanya jenis dengan count > 0,
 * urutan `EXCEPTION_KINDS`; selisih_kecil satu butir per kasir di akhir.
 */
export function exceptionAttention(
  state: Readonly<MockState>,
  now: number,
): ExceptionAttention[] {
  return EXCEPTION_KINDS.flatMap((kind) =>
    kind === "selisih_kecil"
      ? smallShortageAttention(state, now)
      : attentionOf(state, kind, unreviewed(state, kind, now), null),
  );
}

/**
 * Tandai ditinjau: `reviewedAt = max(lama, min(upTo, now))` — idempoten, tidak pernah mundur.
 * selisih_kecil wajib `kasirId` dan hanya memajukan penanda kasir itu (K18).
 */
export function reviewExceptions(
  state: MockState,
  kind: ExceptionKind,
  upTo: number,
  now: number,
  kasirId: string | null = null,
): void {
  const next = Math.min(upTo, now);
  const advance = (old: number | null) =>
    old === null ? next : Math.max(old, next);
  if (kind === "selisih_kecil") {
    if (kasirId === null) throw new Error("selisih_kecil butuh kasirId (K18)");
    state.smallShortageReviews[kasirId] = advance(
      state.smallShortageReviews[kasirId] ?? null,
    );
    return;
  }
  state.exceptionReviews[kind] = advance(state.exceptionReviews[kind]);
}
