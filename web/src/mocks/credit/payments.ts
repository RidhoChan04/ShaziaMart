import type {
  CreditPaymentChannel,
  CreditPaymentMethod,
  PrintStatus,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { repaymentProblem } from "@/shared/lib/credit-rules";
import { newId } from "@/shared/lib/id";
import type { MockCreditPayment, MockShift, MockState, MockUser } from "../db";
import { problem } from "../handlers/respond";
import { appendCredit, balanceOf } from "../ledger";
import { getScenario } from "../scenarios";

/** K2: metode per jalur; hanya kasir + tunai yang masuk laci. */
const METHODS: Record<CreditPaymentChannel, readonly CreditPaymentMethod[]> = {
  kasir: ["tunai", "qris"],
  pemilik: ["transfer", "titip"],
};
const ID_MAX = 64;
const REASON_MAX = 200;

const invalid = (detail: string): Response =>
  problem(422, "VALIDATION", detail);
const idTaken = (): Response =>
  problem(409, "ID_TAKEN", "ID ini sudah dipakai pengguna lain");
const notFound = (): Response =>
  problem(404, "NOT_FOUND", "Pelunasan tidak ditemukan");
const shiftClosed = (): Response =>
  problem(409, "SHIFT_CLOSED", "Tidak ada shift yang terbuka");

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const intOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isSafeInteger(v) ? v : null;

/** Σ uang pelunasan di laci shift ini (`ShiftClosure.creditPayments`); tidak pernah negatif. */
export const creditPaymentsOf = (shift: MockShift): number =>
  shift.creditCash.reduce((sum, c) => sum + c.amount, 0);

/** Isi body pelunasan; null = bentuk salah (bukan objek, `id` bukan 1..64, kasir tanpa `print`). */
function readInput(channel: CreditPaymentChannel, input: unknown) {
  if (!isObj(input)) return null;
  const { id } = input;
  if (typeof id !== "string" || id.length < 1 || id.length > ID_MAX) {
    return null;
  }
  if (channel === "kasir" && typeof input.print !== "boolean") return null;
  return {
    id,
    amount: intOrNull(input.amount),
    method: input.method,
    cashReceived: input.cashReceived,
    print: input.print === true,
  };
}

const isMethodOf = (
  channel: CreditPaymentChannel,
  m: unknown,
): m is CreditPaymentMethod =>
  (METHODS[channel] as readonly unknown[]).includes(m);

/** Uang diterima & kembalian (K4); string = galat 422. */
function cashOf(
  method: CreditPaymentMethod,
  amount: number,
  cashReceived: unknown,
): { cashReceived: number; change: number } | string {
  if (method === "tunai") {
    const cash = intOrNull(cashReceived);
    if (cash === null || cash < amount) {
      return "Uang diterima kurang dari jumlah bayar";
    }
    return { cashReceived: cash, change: cash - amount };
  }
  if (method === "qris" && cashReceived !== null) {
    return "Uang diterima hanya untuk Tunai";
  }
  return { cashReceived: 0, change: 0 };
}

function printStatusOf(
  channel: CreditPaymentChannel,
  print: boolean,
): PrintStatus {
  if (channel !== "kasir" || !print) return "tidak_dicetak";
  return getScenario() === "printer-gagal" ? "gagal" : "tercetak";
}

type PaymentInput = NonNullable<ReturnType<typeof readInput>>;

/** Pemeriksaan pelunasan baru: pelanggan → shift kasir → metode jalur → jumlah → uang. */
function checkNew(
  state: Readonly<MockState>,
  channel: CreditPaymentChannel,
  customerId: string,
  body: PaymentInput,
):
  | {
      method: CreditPaymentMethod;
      amount: number;
      cash: { cashReceived: number; change: number };
    }
  | Response {
  if (!state.customers.some((c) => c.id === customerId)) {
    return problem(404, "NOT_FOUND", "Pelanggan tidak ditemukan");
  }
  if (channel === "kasir" && state.shift === null) return shiftClosed();
  const { method, amount } = body;
  if (!isMethodOf(channel, method)) return invalid("Cara bayar tidak valid");
  const wrongAmount = repaymentProblem(amount, balanceOf(state, customerId));
  if (wrongAmount !== null || amount === null) {
    return invalid(wrongAmount ?? "Jumlah minimal Rp1");
  }
  const cash = cashOf(method, amount, body.cashReceived);
  if (typeof cash === "string") return invalid(cash);
  return { method, amount, cash };
}

/**
 * Catat pelunasan (K2–K4, R6). Urutan: bentuk & `id` → 422; `id` milik pembuat lain (atau jalur
 * lain) → 409 ID_TAKEN; milik sendiri → 200 apa adanya (sebelum cek shift/saldo); pelanggan → 404;
 * kasir tanpa shift → 409 SHIFT_CLOSED; metode di luar jalur → 422; jumlah → 422; uang → 422.
 * Jam = `now` server. Buku −jumlah (`paymentId`), dan kasir + tunai → laci +jumlah.
 */
export function recordPayment(
  state: MockState,
  user: MockUser,
  channel: CreditPaymentChannel,
  customerId: string,
  input: unknown,
  now: number,
): { status: 200 | 201; payment: MockCreditPayment } | Response {
  const body = readInput(channel, input);
  if (body === null) return invalid("Data pelunasan tidak valid");
  const saved = state.creditPayments.find((p) => p.id === body.id);
  if (saved) {
    // Rekaman jalur lain tidak bisa dikembalikan dalam bentuk respons jalur ini.
    return saved.createdById === user.id && saved.channel === channel
      ? { status: 200, payment: saved }
      : idTaken();
  }
  const checked = checkNew(state, channel, customerId, body);
  if (checked instanceof Response) return checked;
  const { method, amount, cash } = checked;
  const { id } = body;
  const { shift } = state;

  appendCredit(state, {
    customerId,
    amount: -amount,
    at: now,
    saleId: null,
    paymentId: id,
  });
  const payment: MockCreditPayment = {
    id,
    customerId,
    amount,
    at: now,
    channel,
    method,
    createdById: user.id,
    createdByName: user.name,
    shiftId: channel === "kasir" ? (shift?.id ?? null) : null,
    ...cash,
    balanceAfter: balanceOf(state, customerId),
    printStatus: printStatusOf(channel, body.print),
    cancelledAt: null,
    cancelledById: null,
    cancelledByName: null,
    cancelledChannel: null,
    cancelReason: null,
  };
  state.creditPayments.push(payment);
  if (channel === "kasir" && method === "tunai" && shift) {
    shift.creditCash.push({
      id: newId(now),
      at: now,
      amount,
      paymentId: id,
      kind: "pelunasan",
    });
  }
  return { status: 201, payment };
}

/** Alasan batal 1..200 karakter setelah trim; null = tidak valid. */
function readReason(input: unknown): string | null {
  const reason = isObj(input) ? input.reason : undefined;
  if (typeof reason !== "string") return null;
  const trimmed = reason.trim();
  return trimmed.length >= 1 && trimmed.length <= REASON_MAX ? trimmed : null;
}

/**
 * Batalkan pelunasan (K5, ruling R2), idempoten. Kasir: 404 (juga jalur pemilik) → sudah batal →
 * 200 → alasan 422 → tanpa shift 409 SHIFT_CLOSED → bukan shift buka 409 OUTSIDE_SHIFT → buku
 * +jumlah dan, bila tunai, laci shift ini −jumlah. Pemilik: 404 → sudah batal → 200 → alasan 422 →
 * pelunasan kasir shift yang masih buka 409 IN_OPEN_SHIFT → buku +jumlah, laci tidak pernah dikoreksi.
 */
export function cancelPayment(
  state: MockState,
  paymentId: string,
  by: { user: MockUser; channel: CreditPaymentChannel },
  input: unknown,
  now: number,
): MockCreditPayment | Response {
  const p = state.creditPayments.find((x) => x.id === paymentId);
  if (!p || (by.channel === "kasir" && p.channel !== "kasir")) {
    return notFound();
  }
  if (p.cancelledAt !== null) return p;
  const reason = readReason(input);
  if (reason === null)
    return invalid("Alasan wajib diisi (maksimal 200 karakter)");
  const { shift } = state;
  const inOpenShift =
    p.channel === "kasir" && shift !== null && p.shiftId === shift.id;
  if (by.channel === "kasir") {
    if (shift === null) return shiftClosed();
    if (!inOpenShift) {
      return problem(
        409,
        "OUTSIDE_SHIFT",
        "Pelunasan dari shift sebelumnya — batalkan dari app pemilik",
      );
    }
  } else if (inOpenShift) {
    return problem(
      409,
      "IN_OPEN_SHIFT",
      "Masih di shift yang buka — batalkan dari kasir",
    );
  }

  appendCredit(state, {
    customerId: p.customerId,
    amount: p.amount,
    at: now,
    saleId: null,
    paymentId: p.id,
  });
  if (by.channel === "kasir" && p.method === "tunai" && shift) {
    shift.creditCash.push({
      id: newId(now),
      at: now,
      amount: -p.amount,
      paymentId: p.id,
      kind: "batal_pelunasan",
    });
  }
  p.cancelledAt = now;
  p.cancelledById = by.user.id;
  p.cancelledByName = by.user.name;
  p.cancelledChannel = by.channel;
  p.cancelReason = reason;
  return p;
}
