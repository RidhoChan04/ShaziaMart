import { HttpResponse, http } from "msw";
import type {
  PayDebtInput,
  ReceiptPayment,
  SupplierDebtList,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { newId } from "@/shared/lib/id";
import { paidSummary } from "@/shared/lib/payment-labels";
import { validatePayment } from "@/shared/lib/receipt-rules";
import { mockDb } from "../db";
import { addCashOut, laciPaid } from "../receipts/cash";
import { debtsOf, toSupplierDebt } from "../receipts/debts";
import { withScenario } from "../scenarios";
import { invalid, problem, readJson, requireOwnerSession } from "./respond";

const BASE = "/api/owner/supplier-debts";

function readPayDebt(
  body: Record<string, unknown> | null,
): PayDebtInput | null {
  const method = body?.method;
  const cashSource = body?.cashSource;
  const okMethod = method === "tunai" || method === "transfer";
  const okSource =
    cashSource === "laci" || cashSource === "pemilik" || cashSource === null;
  return okMethod && okSource ? { method, cashSource } : null;
}

export const ownerDebtHandlers = [
  http.get(
    BASE,
    withScenario(() => {
      const state = mockDb.get();
      const owner = requireOwnerSession(state);
      if (owner instanceof Response) return owner;
      const { shift } = state;
      const body: SupplierDebtList = {
        debts: debtsOf(state).map((r) => toSupplierDebt(state, r)),
        drawerShift: shift
          ? { kasirName: shift.kasirName, openedAt: shift.openedAt }
          : null,
      };
      return HttpResponse.json(body);
    }),
  ),
  http.post(
    `${BASE}/:receiptId/pay`,
    withScenario(async ({ params, request }) => {
      const state = mockDb.get();
      const owner = requireOwnerSession(state);
      if (owner instanceof Response) return owner;
      const r = state.receipts.find((x) => x.id === String(params.receiptId));
      if (r?.payment.timing !== "nanti") {
        return problem(404, "NOT_FOUND", "Utang tidak ditemukan");
      }
      if (r.status === "dibatalkan") {
        return problem(409, "RECEIPT_CANCELLED", "Nota ini sudah dibatalkan");
      }
      if (r.paid !== null) {
        return problem(409, "DEBT_ALREADY_PAID", "Utang ini sudah lunas");
      }
      const input = readPayDebt(await readJson(request));
      if (input === null) return invalid("Cara bayar tidak valid");
      // Lunas penuh = bayar sekarang senilai nota: aturan & pesan sumber uang dari receipt-rules (R11).
      const asPaidNow: ReceiptPayment = {
        timing: "sekarang",
        ...input,
        dueDate: null,
      };
      const [mismatch] = validatePayment(asPaidNow, r.notaDate, true);
      if (mismatch) return invalid(mismatch.message);
      const [noShift] = validatePayment(
        asPaidNow,
        r.notaDate,
        state.shift !== null,
      );
      if (noShift) return problem(409, "SHIFT_CLOSED", noShift.message);

      const now = Date.now();
      mockDb.update((s) => {
        const stored = s.receipts.find((x) => x.id === r.id);
        if (!stored) return;
        stored.paid = { at: now, ...input, byName: owner.name };
        addCashOut(s, laciPaid(stored), stored.id, "lunas", now);
        s.receiptAudit.push({
          id: newId(now),
          receiptId: stored.id,
          at: now,
          actorName: owner.name,
          action: "lunas",
          changes: [paidSummary(input)],
        });
      });
      const after = mockDb.get();
      const paid = after.receipts.find((x) => x.id === r.id) ?? r;
      return HttpResponse.json(toSupplierDebt(after, paid));
    }),
  ),
];
