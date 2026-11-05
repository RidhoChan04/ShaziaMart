import { HttpResponse, http } from "msw";
import type {
  CurrentShift,
  Shift,
  ShiftClosure,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { newId } from "@/shared/lib/id";
import { creditPaymentsOf } from "../credit/payments";
import { type MockShift, mockDb } from "../db";
import { supplierPaymentsOf } from "../receipts/cash";
import { withScenario } from "../scenarios";
import { invalid, problem, readJson, requireSession } from "./respond";

const toShift = ({
  id,
  kasirId,
  kasirName,
  openedAt,
  openingCash,
}: MockShift): Shift => ({ id, kasirId, kasirName, openedAt, openingCash });

/** Σ `saleRefunds` shift ini (`ShiftClosure.saleRefunds`), tanpa membedakan asal pengembalian. */
const saleRefundsOf = (shift: MockShift): number =>
  shift.saleRefunds.reduce((sum, r) => sum + r.amount, 0);

const isMoney = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

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
        cashOuts: [],
        creditCash: [],
        saleRefunds: [],
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
      // Uang keluar laci ke supplier (barang masuk, koreksi nota, pelunasan) mengurangi kas seharusnya.
      const supplierPayments = supplierPaymentsOf(shift);
      // Hanya pelunasan kasbon Tunai shift ini (bukan uang diterima) yang masuk laci.
      const creditPayments = creditPaymentsOf(shift);
      // (ruling R12) Tunai yang keluar laci untuk transaksi yang dibatalkan kasir di shift ini.
      const saleRefunds = saleRefundsOf(shift);
      const expectedCash =
        shift.openingCash +
        shift.cashSales -
        supplierPayments +
        creditPayments -
        saleRefunds;
      const closure: ShiftClosure = {
        shiftId: shift.id,
        openingCash: shift.openingCash,
        cashSales: shift.cashSales,
        supplierPayments,
        creditPayments,
        saleRefunds,
        expectedCash,
        countedCash,
        difference: countedCash - expectedCash,
        salesCount: shift.salesCount,
      };
      mockDb.update((s) => {
        s.closedShifts.push({
          ...closure,
          kasirName: shift.kasirName,
          openedAt: shift.openedAt,
          closedAt: Date.now(),
        });
        s.shift = null;
        s.session = null;
      });
      return HttpResponse.json(closure);
    }),
  ),
];
