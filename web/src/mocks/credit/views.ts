import type {
  CreditAgeSummary,
  CreditHistoryEntry,
  Customer,
  KasirCreditPayment,
  OwnerCustomer,
  OwnerCustomerList,
  OwnerCustomerRow,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { creditAge, creditAgeDays } from "@/shared/lib/credit-rules";
import type { MockCreditPayment, MockState } from "../db";
import { oldestUnpaidAt } from "../ledger";

/** Proyeksi pelunasan untuk kasir: hanya key allowlist kontrak (tanpa jalur, pencatat id, data batal). */
export function toKasirPayment(
  state: Readonly<MockState>,
  p: MockCreditPayment,
): KasirCreditPayment {
  return {
    id: p.id,
    customerId: p.customerId,
    customerName:
      state.customers.find((c) => c.id === p.customerId)?.name ?? "",
    amount: p.amount,
    // Jalur kasir hanya tunai/qris (recordPayment); rekaman jalur pemilik tidak pernah sampai sini.
    method: p.method === "qris" ? "qris" : "tunai",
    cashReceived: p.cashReceived,
    change: p.change,
    balanceAfter: p.balanceAfter,
    createdAt: p.at,
    kasirName: p.createdByName,
    shiftId: p.shiftId ?? "",
    status: p.cancelledAt === null ? "aktif" : "dibatalkan",
    printStatus: p.printStatus,
  };
}

/** K6, Q8: umur hanya untuk saldo > 0; lebih bayar (saldo < 0) diperlakukan tanpa utang. */
function toRow(
  state: Readonly<MockState>,
  c: Customer,
  now: number,
): OwnerCustomerRow {
  const oldest = c.balance > 0 ? oldestUnpaidAt(state, c.id) : null;
  const ageDays = creditAgeDays(oldest, now);
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    balance: c.balance,
    creditLimit: c.creditLimit,
    oldestUnpaidAt: oldest,
    ageDays,
    age: creditAge(ageDays),
  };
}

const AGES = ["hari_0_7", "hari_8_30", "lebih_30_hari"] as const;

/** Semua pelanggan urut saldo terbesar lalu nama; ringkasan hanya saldo > 0. */
export function ownerCustomerList(
  state: Readonly<MockState>,
  now: number,
): OwnerCustomerList {
  const customers = state.customers
    .map((c) => toRow(state, c, now))
    .sort(
      (a, b) => b.balance - a.balance || a.name.localeCompare(b.name, "id"),
    );
  const debtors = customers.filter((c) => c.balance > 0);
  const ages: CreditAgeSummary[] = AGES.map((age) => {
    const group = debtors.filter((c) => c.age === age);
    return {
      age,
      count: group.length,
      total: group.reduce((sum, c) => sum + c.balance, 0),
    };
  });
  return {
    customers,
    totalBalance: debtors.reduce((sum, c) => sum + c.balance, 0),
    debtorCount: debtors.length,
    ages,
    overdueCount: debtors.filter((c) => c.age === "lebih_30_hari").length,
  };
}

/**
 * Riwayat pelanggan (K9), terbaru dulu: kasbon dan pelunasan, pembalik dilipat ke barisnya.
 * Batal kasbon karena batal jual: sementara tanpa nama & alasan (T2b mengisi dari `voided*`).
 */
function historyOf(
  state: Readonly<MockState>,
  customerId: string,
): CreditHistoryEntry[] {
  const { shift } = state;
  const ledger = state.creditLedger.filter((e) => e.customerId === customerId);
  const kasbon = ledger
    .filter((e) => e.amount > 0 && e.paymentId === null)
    .map((e): CreditHistoryEntry => {
      const sale = state.sales.find((s) => s.id === e.saleId);
      const voided = ledger.find(
        (x) => x.amount < 0 && x.saleId !== null && x.saleId === e.saleId,
      );
      return {
        id: e.id,
        at: e.at,
        kind: "kasbon",
        amount: e.amount,
        saleId: e.saleId,
        saleNumber: sale?.number ?? null,
        kasirName: sale?.kasirName ?? null,
        payment: null,
        cancelled: voided
          ? {
              at: sale?.voidedAt ?? voided.at,
              byName: "",
              reason: "",
              channel: "kasir",
            }
          : null,
      };
    });
  const payments = state.creditPayments
    .filter((p) => p.customerId === customerId)
    .map(
      (p): CreditHistoryEntry => ({
        id: p.id,
        at: p.at,
        kind: "pelunasan",
        amount: p.amount,
        saleId: null,
        saleNumber: null,
        kasirName: null,
        payment: {
          id: p.id,
          channel: p.channel,
          method: p.method,
          byName: p.createdByName,
          cashReceived: p.cashReceived,
          change: p.change,
          inOpenShift:
            p.channel === "kasir" && shift !== null && p.shiftId === shift.id,
        },
        cancelled:
          p.cancelledAt === null
            ? null
            : {
                at: p.cancelledAt,
                byName: p.cancelledByName ?? "",
                reason: p.cancelReason ?? "",
                channel: p.cancelledChannel ?? p.channel,
              },
      }),
    );
  // Dibalik dulu agar baris dengan jam sama tetap terbaru (tercatat belakangan) dulu.
  return [...kasbon, ...payments].reverse().sort((a, b) => b.at - a.at);
}

export function ownerCustomer(
  state: Readonly<MockState>,
  customerId: string,
  now: number,
): OwnerCustomer | null {
  const c = state.customers.find((x) => x.id === customerId);
  if (!c) return null;
  return { ...toRow(state, c, now), history: historyOf(state, customerId) };
}
