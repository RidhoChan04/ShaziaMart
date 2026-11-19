import { type HttpHandler, HttpResponse, http } from "msw";
import type {
  OwnerShiftDetail,
  OwnerShiftList,
  OwnerShiftRow,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { isIsoDate, jakartaIsoDate } from "@/shared/lib/business-day";
import { drawerTotals } from "../cash/drawer";
import { shiftQris } from "../cash/qris-days";
import { toOwnerCashTake, toOwnerDrawerExpense } from "../cash/views";
import { type MockState, mockDb } from "../db";
import { withScenario } from "../scenarios";
import { invalid, problem, requireOwnerSession } from "./respond";

const BASE = "/api/owner/shifts";

const byAt = (a: { at: number }, b: { at: number }): number => a.at - b.at;

/**
 * Shift yang `openedAt`-nya jatuh pada `date` (WIB), ditambah shift yang sedang buka bila `date` =
 * hari ini walau dibuka kemarin; `openedAt` terbaru dulu. Shift buka: angka tutup null.
 */
function shiftRows(
  state: Readonly<MockState>,
  date: string,
  today: string,
): OwnerShiftRow[] {
  const rows: OwnerShiftRow[] = state.closedShifts
    .filter((c) => jakartaIsoDate(c.openedAt) === date)
    .map((c) => ({
      id: c.shiftId,
      kasirName: c.kasirName,
      openedAt: c.openedAt,
      closedAt: c.closedAt,
      countedCash: c.countedCash,
      difference: c.difference,
    }));
  const open = state.shift;
  if (
    open !== null &&
    (date === today || jakartaIsoDate(open.openedAt) === date)
  ) {
    rows.push({
      id: open.id,
      kasirName: open.kasirName,
      openedAt: open.openedAt,
      closedAt: null,
      countedCash: null,
      difference: null,
    });
  }
  return rows.sort((a, b) => b.openedAt - a.openedAt);
}

/** Kas keluar & ambil uang pemilik di dalam shift ini (termasuk yang dibatalkan) + QRIS shift. */
function ownerExtras(
  state: Readonly<MockState>,
  shiftId: string,
): Pick<
  OwnerShiftDetail,
  "expenseItems" | "ownerTakeItems" | "qrisSales" | "qrisRepayments"
> {
  const qris = shiftQris(state, shiftId);
  return {
    expenseItems: state.drawerExpenses
      .filter((e) => e.shiftId === shiftId)
      .sort(byAt)
      .map((e) => toOwnerDrawerExpense(state, e)),
    ownerTakeItems: state.cashTakes
      .filter((t) => t.shiftId === shiftId)
      .sort(byAt)
      .map((t) => toOwnerCashTake(state, t)),
    qrisSales: qris.sales,
    qrisRepayments: qris.repayments,
  };
}

/**
 * Rincian laci: shift tutup = closure tersimpan apa adanya (tidak pernah dihitung ulang); shift buka
 * = rumus laci tunggal `drawerTotals` sekarang, tanpa uang fisik & selisih. null = tidak dikenal.
 */
function shiftDetail(
  state: Readonly<MockState>,
  shiftId: string,
): OwnerShiftDetail | null {
  const open = state.shift;
  if (open !== null && open.id === shiftId) {
    return {
      shiftId,
      ...drawerTotals(state, open),
      countedCash: null,
      difference: null,
      salesCount: open.salesCount,
      kasirName: open.kasirName,
      openedAt: open.openedAt,
      closedAt: null,
      suggestedOpening: open.suggestedOpening,
      openingNote: open.openingNote,
      ...ownerExtras(state, shiftId),
    };
  }
  const c = state.closedShifts.find((x) => x.shiftId === shiftId);
  if (c === undefined) return null;
  return {
    shiftId,
    openingCash: c.openingCash,
    cashSales: c.cashSales,
    supplierPayments: c.supplierPayments,
    creditPayments: c.creditPayments,
    saleRefunds: c.saleRefunds,
    expenses: c.expenses,
    ownerTakes: c.ownerTakes,
    expectedCash: c.expectedCash,
    countedCash: c.countedCash,
    difference: c.difference,
    salesCount: c.salesCount,
    kasirName: c.kasirName,
    openedAt: c.openedAt,
    closedAt: c.closedAt,
    suggestedOpening: c.suggestedOpening,
    openingNote: c.openingNote,
    ...ownerExtras(state, shiftId),
  };
}

/** Shift & kas pemilik: daftar per tanggal dan rincian laci. */
export const ownerShiftHandlers: HttpHandler[] = [
  http.get(
    BASE,
    withScenario(({ request }) => {
      const state = mockDb.get();
      const owner = requireOwnerSession(state);
      if (owner instanceof Response) return owner;
      const today = jakartaIsoDate(Date.now());
      const date = new URL(request.url).searchParams.get("date") ?? today;
      if (!isIsoDate(date)) return invalid("Tanggal tidak valid");
      const body: OwnerShiftList = {
        date,
        items: shiftRows(state, date, today),
        // Pengambilan di sela shift tanggal itu; yang di dalam shift ada di rincian shiftnya.
        takes: state.cashTakes
          .filter((t) => t.shiftId === null && jakartaIsoDate(t.at) === date)
          .sort((a, b) => b.at - a.at)
          .map((t) => toOwnerCashTake(state, t)),
        openKasirName: state.shift?.kasirName ?? null,
      };
      return HttpResponse.json(body);
    }),
  ),
  http.get(
    `${BASE}/:shiftId`,
    withScenario(({ params }) => {
      const state = mockDb.get();
      const owner = requireOwnerSession(state);
      if (owner instanceof Response) return owner;
      const body = shiftDetail(state, String(params.shiftId));
      if (body === null) {
        return problem(404, "NOT_FOUND", "Shift tidak ditemukan");
      }
      return HttpResponse.json(body);
    }),
  ),
];
