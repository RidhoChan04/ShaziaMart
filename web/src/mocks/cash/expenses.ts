import type { ExpenseCancelChannel } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { cleanReason } from "@/shared/lib/reason-rules";
import type { MockDrawerExpense, MockState, MockUser } from "../db";
import { invalid, problem } from "../handlers/respond";
import { clientId, idTaken, isObj, positiveInt } from "./input";

const REASON_INVALID = "Alasan wajib diisi (maksimal 200 karakter)";

/**
 * (S2, K10) Catat kas keluar. Urutan: `id` → 422; `id` milik pengguna ini → 200 apa adanya (body
 * diabaikan), milik pengguna lain → 409 ID_TAKEN; nominal/alasan → 422; tanpa shift → 409
 * SHIFT_CLOSED. Jam = `now` server; `shiftId` = shift yang sedang buka.
 */
export function recordExpense(
  state: MockState,
  user: MockUser,
  input: unknown,
  now: number,
): { status: 200 | 201; expense: MockDrawerExpense } | Response {
  const id = clientId(input);
  if (id === null) return invalid("Data kas keluar tidak valid");
  const saved = state.drawerExpenses.find((e) => e.id === id);
  if (saved) {
    return saved.createdById === user.id
      ? { status: 200, expense: saved }
      : idTaken();
  }
  const body = isObj(input) ? input : {};
  const amount = positiveInt(body.amount);
  if (amount === null) return invalid("Nominal harus bilangan bulat minimal 1");
  const reason = cleanReason(body.reason);
  if (reason === null) return invalid(REASON_INVALID);
  const { shift } = state;
  if (shift === null) {
    return problem(409, "SHIFT_CLOSED", "Tidak ada shift yang terbuka");
  }
  const expense: MockDrawerExpense = {
    id,
    at: now,
    amount,
    reason,
    shiftId: shift.id,
    createdById: user.id,
    createdByName: user.name,
    cancelledAt: null,
    cancelledById: null,
    cancelledByName: null,
    cancelledChannel: null,
    cancelReason: null,
  };
  state.drawerExpenses.push(expense);
  return { status: 201, expense };
}

/**
 * (S10, K10) Batalkan kas keluar, idempoten. Kasir: 404 → sudah batal → 200 → alasan 422 → tanpa
 * shift 409 SHIFT_CLOSED → bukan shift buka 409 OUTSIDE_SHIFT. Pemilik: 404 → sudah batal → 200 →
 * alasan 422 → shift yang masih buka 409 IN_OPEN_SHIFT. Laci tidak pernah dikoreksi di sini: Σ
 * `expenses` shift buka dihitung dari kas keluar aktif (`drawerTotals`), closure tersimpan tetap.
 */
export function cancelExpense(
  state: MockState,
  expenseId: string,
  by: { user: MockUser; channel: ExpenseCancelChannel },
  input: unknown,
  now: number,
): MockDrawerExpense | Response {
  const e = state.drawerExpenses.find((x) => x.id === expenseId);
  if (!e) return problem(404, "NOT_FOUND", "Kas keluar tidak ditemukan");
  if (e.cancelledAt !== null) return e;
  const reason = cleanReason(isObj(input) ? input.reason : undefined);
  if (reason === null) return invalid(REASON_INVALID);
  const { shift } = state;
  const inOpenShift = shift !== null && e.shiftId === shift.id;
  if (by.channel === "kasir") {
    if (shift === null) {
      return problem(409, "SHIFT_CLOSED", "Tidak ada shift yang terbuka");
    }
    if (!inOpenShift) {
      return problem(
        409,
        "OUTSIDE_SHIFT",
        "Kas keluar dari shift sebelumnya — batalkan dari app pemilik",
      );
    }
  } else if (inOpenShift) {
    return problem(
      409,
      "IN_OPEN_SHIFT",
      "Masih di shift yang buka — batalkan dari kasir",
    );
  }
  e.cancelledAt = now;
  e.cancelledById = by.user.id;
  e.cancelledByName = by.user.name;
  e.cancelledChannel = by.channel;
  e.cancelReason = reason;
  return e;
}
