import { cleanReason } from "@/shared/lib/reason-rules";
import type { MockCashTake, MockState, MockUser } from "../db";
import { invalid, problem } from "../handlers/respond";
import { cancellableTake } from "./drawer";
import { clientId, idTaken, isObj, optionalNote, positiveInt } from "./input";

const NOTE_MAX = 200;

/**
 * (S5, K9) Ambil uang dari laci oleh pemilik. Urutan: `id` → 422; `id` milik pengguna ini → 200
 * apa adanya (body diabaikan), milik pengguna lain → 409 ID_TAKEN; nominal/catatan → 422. Ada
 * shift buka → `shiftId` shift itu (masuk `ownerTakes`); tanpa shift → `shiftId` null (mengurangi
 * saran modal shift berikutnya).
 */
export function recordTake(
  state: MockState,
  owner: MockUser,
  input: unknown,
  now: number,
): { status: 200 | 201; take: MockCashTake } | Response {
  const id = clientId(input);
  if (id === null) return invalid("Data pengambilan tidak valid");
  const saved = state.cashTakes.find((t) => t.id === id);
  if (saved) {
    return saved.createdById === owner.id
      ? { status: 200, take: saved }
      : idTaken();
  }
  const body = isObj(input) ? input : {};
  const amount = positiveInt(body.amount);
  if (amount === null) return invalid("Nominal harus bilangan bulat minimal 1");
  const note = optionalNote(body.note, NOTE_MAX);
  if (note === undefined) return invalid("Catatan maksimal 200 karakter");
  const take: MockCashTake = {
    id,
    at: now,
    amount,
    note,
    shiftId: state.shift?.id ?? null,
    createdById: owner.id,
    createdByName: owner.name,
    consumedByShiftId: null,
    cancelledAt: null,
    cancelledById: null,
    cancelledByName: null,
    cancelReason: null,
  };
  state.cashTakes.push(take);
  return { status: 201, take };
}

/**
 * (S5, K9) Batalkan pengambilan, idempoten: 404 → sudah batal → 200 → alasan 422 → tidak bisa
 * dibalik lagi (`cancellableTake`) → 409 CASH_TAKE_LOCKED tanpa mengubah apa pun. Efeknya dibalik
 * lewat rumus: pengambilan batal tidak ikut `ownerTakes` shift buka maupun saran modal.
 */
export function cancelTake(
  state: MockState,
  takeId: string,
  owner: MockUser,
  input: unknown,
  now: number,
): MockCashTake | Response {
  const t = state.cashTakes.find((x) => x.id === takeId);
  if (!t) return problem(404, "NOT_FOUND", "Pengambilan tidak ditemukan");
  if (t.cancelledAt !== null) return t;
  const reason = cleanReason(isObj(input) ? input.reason : undefined);
  if (reason === null) {
    return invalid("Alasan wajib diisi (maksimal 200 karakter)");
  }
  if (!cancellableTake(state, t)) {
    return problem(
      409,
      "CASH_TAKE_LOCKED",
      t.shiftId === null
        ? "Sudah dipakai modal shift berikutnya"
        : "Shift sudah tutup — tidak bisa dibatalkan",
    );
  }
  t.cancelledAt = now;
  t.cancelledById = owner.id;
  t.cancelledByName = owner.name;
  t.cancelReason = reason;
  return t;
}
