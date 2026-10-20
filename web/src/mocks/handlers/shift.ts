import { HttpResponse, http } from "msw";
import type {
  CurrentShift,
  Shift,
  ShiftClosure,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { newId } from "@/shared/lib/id";
import { type MockShift, mockDb } from "../db";
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

export const shiftHandlers = [
  http.get(
    "/api/shifts/current",
    withScenario(() => {
      const state = mockDb.get();
      const user = requireSession(state);
      if (user instanceof Response) return user;
      const body: CurrentShift = {
        shift: state.shift ? toShift(state.shift) : null,
      };
      return HttpResponse.json(body);
    }),
  ),
  http.post(
    "/api/shifts",
    withScenario(async ({ request }) => {
      const user = requireSession(mockDb.get());
      if (user instanceof Response) return user;
      const body = await readJson(request);
      const openingCash = body?.openingCash;
      if (!isMoney(openingCash)) {
        return invalid("Modal awal harus bilangan bulat minimal 0");
      }
      if (mockDb.get().shift) {
        return problem(409, "SHIFT_ALREADY_OPEN", "Shift sudah dibuka");
      }
      const shift: MockShift = {
        id: newId(),
        kasirId: user.id,
        kasirName: user.name,
        openedAt: Date.now(),
        openingCash,
        cashSales: 0,
        salesCount: 0,
      };
      mockDb.update((s) => {
        s.shift = shift;
      });
      return HttpResponse.json(toShift(shift), { status: 201 });
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
      const expectedCash = shift.openingCash + shift.cashSales;
      const closure: ShiftClosure = {
        shiftId: shift.id,
        openingCash: shift.openingCash,
        cashSales: shift.cashSales,
        expectedCash,
        countedCash,
        difference: countedCash - expectedCash,
        salesCount: shift.salesCount,
      };
      mockDb.update((s) => {
        s.closedShifts.push(closure);
        s.shift = null;
        s.session = null;
      });
      return HttpResponse.json(closure);
    }),
  ),
];
