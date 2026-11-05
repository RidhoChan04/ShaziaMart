import type {
  Customer,
  KasirCreditPaymentInput,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { repaymentProblem } from "@/shared/lib/credit-rules";
import { parseRupiah } from "@/shared/lib/money";

/** Isian lembar Pelunasan kasbon apa adanya (teks yang diketik kasir). */
export type RepaymentDraft = {
  customer: Customer | null;
  amount: string;
  method: "tunai" | "qris";
  received: string;
};

/** Pratinjau saja; server yang berwenang atas saldo dan kembalian. */
export type RepaymentState = {
  canSubmit: boolean;
  amount: number | null;
  change: number | null;
  shortage: number | null;
  balanceAfter: number | null;
  problem: string | null;
};

const BLOCKED: RepaymentState = {
  canSubmit: false,
  amount: null,
  change: null,
  shortage: null,
  balanceAfter: null,
  problem: null,
};

export function repaymentState(d: RepaymentDraft): RepaymentState {
  const { customer } = d;
  if (customer === null) return BLOCKED;
  const amount = parseRupiah(d.amount);
  if (customer.balance <= 0) {
    return { ...BLOCKED, problem: repaymentProblem(amount, customer.balance) };
  }
  // Isian belum berupa angka: belum ada galat yang perlu ditampilkan.
  if (amount === null) return BLOCKED;
  const problem = repaymentProblem(amount, customer.balance);
  if (problem !== null) return { ...BLOCKED, problem };
  const balanceAfter = customer.balance - amount;
  const ok: RepaymentState = { ...BLOCKED, amount, balanceAfter };
  if (d.method === "qris") return { ...ok, canSubmit: true };
  const received = parseRupiah(d.received);
  if (received === null) return ok;
  if (received < amount) return { ...ok, shortage: amount - received };
  return { ...ok, canSubmit: true, change: received - amount };
}

/** Badan permintaan; melempar bila isian belum valid. */
export function toRepaymentInput(
  id: string,
  d: RepaymentDraft,
  s: RepaymentState,
  print: boolean,
): KasirCreditPaymentInput {
  if (!s.canSubmit || d.customer === null || s.amount === null) {
    throw new Error("Pelunasan belum valid");
  }
  const cashReceived = d.method === "tunai" ? parseRupiah(d.received) : null;
  if (d.method === "tunai" && cashReceived === null) {
    throw new Error("Uang diterima belum valid");
  }
  return {
    id,
    customerId: d.customer.id,
    amount: s.amount,
    method: d.method,
    cashReceived,
    print,
  };
}
