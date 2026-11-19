import { HttpResponse, http } from "msw";
import type {
  CurrentShift,
  Shift,
  ShiftClosure,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { newId } from "@/shared/lib/id";
import { formatRupiah } from "@/shared/lib/money";
import {
  drawerTotals,
  openingSuggestion,
  pendingBetweenTakes,
} from "../cash/drawer";
import { optionalNote } from "../cash/input";
import {
  type MockShift,
  type MockState,
  type MockUser,
  mockDb,
  updateWith,
} from "../db";
import { withScenario } from "../scenarios";
import { invalid, problem, readJson, requireSession } from "./respond";

const toShift = ({
  id,
  kasirId,
  kasirName,
  openedAt,
  openingCash,
}: MockShift): Shift => ({ id, kasirId, kasirName, openedAt, openingCash });

const isMoney = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

const NOTE_MAX = 200;

/**
 * (S4, K8, K22) Buka shift dengan serah terima modal. Urutan: modal/catatan tidak sah → 422 →
 * shift sudah buka → 409 → saran (dihitung ulang sekarang) tidak null dan modal ≠ saran tanpa
 * catatan → 422 OPENING_MISMATCH. Catatan disimpan hanya bila modal berbeda dari saran; semua
 * pengambilan sela yang masih aktif ditandai terpakai shift baru ini.
 */
function openShift(
  state: MockState,
  user: MockUser,
  input: Record<string, unknown> | null,
  now: number,
): MockShift | Response {
  const openingCash = input?.openingCash;
  if (!isMoney(openingCash)) {
    return invalid("Modal awal harus bilangan bulat minimal 0");
  }
  const note = optionalNote(input?.openingNote, NOTE_MAX);
  if (note === undefined) return invalid("Alasan maksimal 200 karakter");
  if (state.shift) {
    return problem(409, "SHIFT_ALREADY_OPEN", "Shift sudah dibuka");
  }
  const { suggestedCash } = openingSuggestion(state);
  const differs = suggestedCash !== null && openingCash !== suggestedCash;
  if (differs && note === null) {
    return problem(
      422,
      "OPENING_MISMATCH",
      `Isi alasan bila modal berbeda dari ${formatRupiah(suggestedCash)}`,
      { suggestedCash },
    );
  }
  const shift: MockShift = {
    id: newId(now),
    kasirId: user.id,
    kasirName: user.name,
    openedAt: now,
    openingCash,
    suggestedOpening: suggestedCash,
    openingNote: differs ? note : null,
    cashSales: 0,
    salesCount: 0,
    cashOuts: [],
    creditCash: [],
    saleRefunds: [],
  };
  for (const take of pendingBetweenTakes(state)) {
    take.consumedByShiftId = shift.id;
  }
  state.shift = shift;
  return shift;
}

export const shiftHandlers = [
  http.get(
    "/api/shifts/current",
    withScenario(() => {
      const state = mockDb.get();
      const body: CurrentShift = {
        shift: state.shift ? toShift(state.shift) : null,
      };
      return HttpResponse.json(body);
    }),
  ),
  http.get(
    "/api/shifts/opening-suggestion",
    withScenario(() => {
      const state = mockDb.get();
      const user = requireSession(state);
      if (user instanceof Response) return user;
      return HttpResponse.json(openingSuggestion(state));
    }),
  ),
  http.post(
    "/api/shifts",
    withScenario(async ({ request }) => {
      // Setelah body dibaca semuanya sinkron: saran dihitung ulang & disimpan atomik.
      const body = await readJson(request);
      const user = requireSession(mockDb.get());
      if (user instanceof Response) return user;
      const now = Date.now();
      const res = updateWith((s) => openShift(s, user, body, now));
      if (res instanceof Response) return res;
      return HttpResponse.json(toShift(res), { status: 201 });
    }),
  ),
  http.post(
    "/api/shifts/current/close",
    withScenario(async ({ request }) => {
      const state = mockDb.get();
      const user = requireSession(state);
      if (user instanceof Response) return user;
      const body = await readJson(request);
      const countedCash = body?.countedCash;
      if (!isMoney(countedCash)) {
        return invalid("Uang fisik harus bilangan bulat minimal 0");
      }
      const { shift } = state;
      if (!shift) {
        return problem(409, "SHIFT_CLOSED", "Tidak ada shift yang terbuka");
      }
      // Rumus laci tunggal (mocks/cash/drawer.ts), sama dengan rincian shift pemilik.
      const totals = drawerTotals(state, shift);
      const closure: ShiftClosure = {
        shiftId: shift.id,
        ...totals,
        countedCash,
        difference: countedCash - totals.expectedCash,
        salesCount: shift.salesCount,
      };
      mockDb.update((s) => {
        s.closedShifts.push({
          ...closure,
          kasirId: shift.kasirId,
          kasirName: shift.kasirName,
          openedAt: shift.openedAt,
          closedAt: Date.now(),
          suggestedOpening: shift.suggestedOpening,
          openingNote: shift.openingNote,
        });
        s.shift = null;
        s.session = null;
      });
      return HttpResponse.json(closure);
    }),
  ),
];
